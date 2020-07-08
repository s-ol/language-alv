'use babel';

const getChildOfType = (node, type) => {
  const matches = node.children.filter(c => c.type == type);
  if (matches.length > 1)
    throw new Error(`more than one ${type} child`);

  return matches.length > 0 ? matches[0] : null;
}

export class EventHighlight {
  constructor(tracker, rootNode) {
    this.tracker = tracker;
    const editor = this.tracker.editor;

    const tagNode = getChildOfType(rootNode, 'tag');
    const headNode = getChildOfType(rootNode, 'head');
    this.tag = parseInt(tagNode.text.substr(1, tagNode.text.length-2));
    this.mark = editor.markBufferRange(tagNode.range, { persistent: false });
    this.deco = editor.decorateMarker(this.mark, { type: 'highlight', class: 'alv event' });
  }

  update() {
    return this.tracker
      .sendTx({ type: 'op', tag: this.tag })
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
