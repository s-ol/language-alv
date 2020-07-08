'use babel';

const getChildOfType = (node, type) => {
  const matches = node.children.filter(c => c.type == type);
  if (matches.length > 1)
    throw new Error(`more than one ${type} child`);

  return matches.length > 0 ? matches[0] : null;
}

export class EventHighlight {
  constructor(tracker, tag, tagNode) {
    this.tracker = tracker;
    this.tag = tag;

    const editor = this.tracker.editor;
    this.mark = editor.markBufferRange(tagNode.range, { persistent: false });
    this.deco = editor.decorateMarker(this.mark, { type: 'highlight', class: 'alv event' });
  }

  update() {
    return this.tracker
      .sendTx({ type: 'state', tag: this.tag })
      .then(res => {
        if (
          res.value &&
          res.value.metatype == '!' &&
          res.value.updated >= this.tracker.lastTick
        ) {
          this.deco.flash('active', 200);
        }
      });
  }

  destroy() {
    this.mark.destroy();
  }
}

export class SwitchHighlight {
  constructor(tracker, tag, node) {
    this.tracker = tracker;
    this.tag = tag;

    const editor = this.tracker.editor;
    this.marks = [];
    this.decos = [];

    const children = node.namedChildren;
    if (children[0].type === 'tag')
      children.splice(0, 1);

    for (var i = 2; i < children.length; i++) {
      const child = children[i];
      const mark = editor.markBufferRange(child.range, { persistent: false });
      const deco = editor.decorateMarker(mark, { type: 'highlight', class: 'alv switch' });
      this.marks.push(mark);
      this.decos.push(deco);

      this.lastActive = -1;
    }
  }

  update() {
    return this.tracker
      .sendTx({ type: 'state', tag: this.tag })
      .then(res => {
        const last = this.decos[this.lastActive];
        if (last)
          last.setProperties({ type: 'highlight', class: 'alv switch' });

        this.lastActive = res.state;
        const next = this.decos[this.lastActive];
        if (next)
          next.setProperties({ type: 'highlight', class: 'alv switch active' });
      });
  }

  destroy() {
    for (var mark of this.marks)
      mark.destroy();
  }
}

export const highlight = (tracker, node, outSet) => {
  const tagNode = getChildOfType(node, 'tag');
  if (!tagNode)
    return Promise.resolve(null);
  const tag = parseInt(tagNode.text.substr(1, tagNode.text.length-2));

  return tracker
    .sendTx({ type: 'info', tag })
    .then((res) => {
      if (res.result && res.result.metatype === '!')
        outSet.add(new EventHighlight(tracker, tag, tagNode));

      if (res.head_meta.name === 'switch')
        outSet.add(new SwitchHighlight(tracker, tag, node));
    });
};
