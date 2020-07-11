'use babel';

import { createSocket } from 'dgram';
import { highlight } from './highlights';
import { CompositeDisposable, Emitter } from 'atom';

const walkCells = (cursor, cb) => {
  do {
    if (cursor.currentNode.type === 'cell') {
      cb(cursor.currentNode);
      cursor.gotoFirstChild();
      walkCells(cursor, cb);
      cursor.gotoParent();
    }
  } while (cursor.gotoNextSibling());
}

export default class Client {
  constructor(editor) {
    this.editor = editor;
    this.subscriptions = new CompositeDisposable();
    this.emitter = new Emitter();

    this.highlights = new Set();

    const buffer = editor.getBuffer();
    this.subscriptions.add(buffer.onDidReload(() => this.findHighlights()));
    this.subscriptions.add(editor.onDidDestroy(() => this.destroy()));

    this.tx = {};
    this.txId = 0;
    this.socket = createSocket('udp4');
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
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    for (var h of this.highlights)
      h.destroy();
    this.highlights.clear();

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
        },
        err => console.error(err),
      );
  }

  destroy() {
    this.subscriptions.dispose();

    if (this.updateInterval)
      clearInterval(this.updateInterval);

    for (var h of this.highlights)
      h.destroy();

    this.socket.close();

    return this.emitter.emit('did-destroy');
  }

  onDidDestroy(callback) {
    return this.emitter.on('did-destroy', callback);
  }
}
