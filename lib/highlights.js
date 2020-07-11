'use babel';

const getChildOfType = (node, type) => {
  const matches = node.children.filter(c => c.type == type);
  if (matches.length > 1)
    throw new Error(`more than one ${type} child`);

  return matches.length > 0 ? matches[0] : null;
}

export class TagHighlight {
  constructor(tracker, info, tagNode) {
    this.tracker = tracker;
    this.tag = info.tag;

    const editor = this.tracker.editor;
    this.mark = editor.markBufferRange(tagNode.range, { persistent: false });
    const element = document.createElement('a');
    element.href = '#';
    element.innerText = tagNode.text;
    element.style.display = 'block';
    element.style.marginTop = 'calc(var(--editor-line-height) * -1em)';
    element.classList.add('alv--tag');
    this.element = element;

    this.isEvt = info.result && info.result.metatype === '!';
    if (this.isEvt)
      element.classList.add('evt');

    this.deco = editor.decorateMarker(this.mark, {
      type: 'overlay',
      position: 'tail',
      item: element,
   });
  }

  update() {
    if (this.isEvt) {
      return this.tracker
        .sendTx({ type: 'state', tag: this.tag })
        .then(res => {
          if (res.value.updated >= this.tracker.lastTick) {
            if (this.flashTimeout)
              clearTimeout(this.flashTimeout);

            this.element.classList.add('active');
            this.flashTimeout = setTimeout(() => {
              this.element.classList.remove('active');
              this.flashTimeout = null;
            }, 200);
          }
        });
    }

    return Promise.resolve();
  }

  destroy() {
    this.mark.destroy();
    if (this.flashTimeout) {
      cancelTimeout(this.flashTimeout);
      this.flashTimeout = null;
    }
  }
}

export class EventHighlight {
  constructor(tracker, info, tagNode) {
    this.tracker = tracker;
    this.tag = info.tag;

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
  constructor(tracker, info, node) {
    this.tracker = tracker;
    this.tag = info.tag;

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
      outSet.add(new TagHighlight(tracker, res, tagNode));

      if (res.head_meta.name === 'switch')
        outSet.add(new SwitchHighlight(tracker, res, node));
    });
};
