'use babel';

import { createSocket } from 'dgram';
import { highlight } from './highlights';

const walkCells = (cursor, cb) => {
  while (cursor.gotoNextSibling()) {
    if (cursor.currentNode.type === 'cell') {
      cb(cursor.currentNode);
      cursor.gotoFirstChild();
      walkCells(cursor, cb);
      cursor.gotoParent();
    }
  }
}

export default class Client {
  constructor(editor) {
    this.editor = editor;
    this.subscription = editor.onDidSave(() => {
      setTimeout(() => this.findHighlights(), 50);
    });
    this.highlights = new Set();

    this.socket = createSocket('udp4');
    this.tx = {};
    this.txId = 0;
    this.socket.on('message', (str) => {
      const msg = JSON.parse(str);
      const tx = this.tx[msg.id];
      delete this.tx[msg.id];
      if (msg.error)
        tx.reject(new Error(msg.error));
      else
        tx.resolve(msg);
    });

    this.lastTick = 0;

    this.findHighlights();
  }

  sendTx(msg) {
    return new Promise((resolve, reject) => {
      this.txId++;
      msg.id = this.txId;
      this.tx[msg.id] = { resolve, reject };
      this.socket.send(JSON.stringify(msg), 37123);
    });
  }

  update() {
    const promises = [];
    for (var hl of this.highlights)
      promises.push(hl.update().catch(err => {}));

    Promise.all(promises)
      .then(() => this.sendTx({ type: 'tick' }))
      .then(res => { this.lastTick = res.tick; })
  }

  findHighlights() {
    if (this.updateInterval) {
      console.info("stopping old hook.");
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    for (var h of this.highlights)
      h.destroy();
    this.highlights.clear();
    console.info("cleared highlights.");

    const cursor = this.editor.getBuffer().getLanguageMode().tree.walk();
    cursor.gotoFirstChild();

    const promises = [];
    walkCells(cursor, (node) => {
      promises.push(highlight(this, node, this.highlights).catch(err => {}));
    });

    Promise.all(promises)
      .then(
        () => {
          this.updateInterval = setInterval(() => this.update(), 50);
          console.info("starting hook.");
        },
        err => console.error(err),
      );
  }

  destroy() {
    this.subscription.dispose();
    this.socket.close();

    if (this.updateInterval)
      clearInterval(this.updateInterval);

    for (var h of this.highlights)
      h.destroy();
  }
}
