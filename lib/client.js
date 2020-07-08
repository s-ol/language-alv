'use babel';

import { createSocket } from 'dgram';
import { EventHighlight } from './highlights';

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
    this.tree = editor.getBuffer().getLanguageMode().tree;
    this.subscription = editor.onDidSave(() => this.findHighlights());
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

    this.updateInterval = setInterval(() => this.update(), 50);
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
      promises.push(hl.update().catch(() => {}));

    Promise.all(promises)
      .then(() => this.sendTx({ type: 'tick' }))
      .then(res => { this.lastTick = res.tick; })
  }

  findHighlights() {
    for (var h of this.highlights)
      h.destroy();
    this.highlights.clear();

    const cursor = this.tree.walk();
    cursor.gotoFirstChild();
    walkCells(cursor, (rootNode) => {
      this.highlights.add(new EventHighlight(this, rootNode));
    });
  }

  destroy() {
    this.subscription.dispose();
    this.socket.close();
    clearInterval(this.updateInterval);
    for (var h of this.highlights)
      h.destroy();
  }
}
