'use babel';

import { CompositeDisposable } from 'atom';
import Client from './client';

export default {
  subscriptions: null,
  swaggers: null,

  activate(state) {
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'alv:toggle-live-view': () => this.toggle(),
    }));

    this.clients = new Map();
  },

  deactivate() {
    this.subscriptions.dispose();
    for (var client of this.clients.values())
      client.destroy();
    this.clients.clear();
  },

  toggle() {
    const editor = atom.workspace.getActiveTextEditor();
    if (this.clients.has(editor)) {
      this.clients.get(editor).destroy();
    } else {
      const client = new Client(editor);
      this.clients.set(editor, client);
      client.onDidDestroy(() => this.clients.delete(editor));
    }
  },
};
