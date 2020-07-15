'use babel';

const getChildOfType = (node, type) => {
  const matches = node.children.filter(c => c.type == type);
  if (matches.length > 1)
    throw new Error(`more than one ${type} child`);

  return matches.length > 0 ? matches[0] : null;
}

export class EventWidget {
  constructor(client, widgetNode) {
    this.widgetNode = widgetNode;

    this.element = document.createElement('div');
    this.element.classList.add('alv--event');

    this.widgetNode.appendChild(this.element);
  }

  update(info) {
    if (info.result.updated >= this.client.lastTick) {
      if (this.flashTimeout)
        clearTimeout(this.flashTimeout);
      
      this.element.classList.add('active');
      this.flashTimeout = setTimeout(() => {
        this.element.classList.remove('active');
        this.flashTimeout = null;
      }, 200);
    }
  }

  destroy() {
    if (this.flashTimeout) {
      clearTimeout(this.flashTimeout);
      this.flashTimeout = null;
    }
    this.widgetNode.removeChild(this.element);
  }
}

export class BoolWidget {
  constructor(client, widgetNode) {
    this.widgetNode = widgetNode;

    this.element = document.createElement('div');
    this.element.classList.add('alv--bool');

    this.widgetNode.appendChild(this.element);
  }

  update(info) {
    if (info.result.value)
      this.element.classList.add('active');
    else
      this.element.classList.remove('active');
  }

  destroy() {
    this.widgetNode.removeChild(this.element);
  }
}

export class BarWidget {
  constructor(client, widgetNode) {
    this.widgetNode = widgetNode;

    this.element = document.createElement('div');
    this.inner = document.createElement('div');
    this.element.appendChild(this.inner);
    this.element.classList.add('alv--bar');

    this.widgetNode.appendChild(this.element);
  }

  update(info) {
    this.inner.style.width = `${info.vis.bar * 100}%`;
  }

  destroy() {
    this.widgetNode.removeChild(this.element);
  }
}

export class TagHighlight {
  constructor(client, info, tagNode) {
    this.client = client;
    this.info = info;
    this.tag = info.tag;
    this.subhls = new Set();

    const editor = this.client.editor;
    this.mark = editor.markBufferRange(tagNode.range, { persistent: false });

    const element = document.createElement('a');
    element.classList.add('alv--tag');
    element.innerText = tagNode.text;
    element.href = '#';
    element.onclick = e => this.toggleWidget(true);

    this.wrapper = document.createElement('div');
    element.appendChild(this.wrapper);

    this.element = element;

    if (this.isEvt)
      element.classList.add('evt');

    this.deco = editor.decorateMarker(this.mark, {
      type: 'overlay',
      position: 'tail',
      item: element,
   });

   this.toggleWidget(false);
  }

  toggleWidget(intense) {
    if (this.widget) {
      this.widget.destroy();
      this.widget = null;
      return;
    }

    let WidgetClass = null;
    if (this.info.vis.bar)
      WidgetClass = BarWidget;
    else if (this.info.result && this.info.result.metatype === '!')
      WidgetClass = EventWidget;
    else if (this.info.result && this.info.result.type === 'bool')
      WidgetClass = BoolWidget;

    if (WidgetClass) {
      this.widget = new WidgetClass(this.client, this.wrapper);
    }
  }

  update(info) {
    return this.client
      .sendTx({ type: 'info', tag: this.tag })
      .then(info => {
        if (this.widget)
          this.widget.update(info);

        for (var sub of this.subhls)
          sub.update(info);
      });
  }

  destroy() {
    this.mark.destroy();

    if (this.widget)
      this.widget.destroy();

    for (var sub of this.subhls)
      sub.destroy();
  }
}

export class ActiveHighlight {
  constructor(client, info, node) {
    this.client = client;
    this.tag = info.tag;

    const editor = this.client.editor;
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

  update(info) {
    const last = this.decos[this.lastActive];
    if (last)
      last.setProperties({ type: 'highlight', class: 'alv switch' });

    this.lastActive = info.vis.active;
    const next = this.decos[this.lastActive];
    if (next)
      next.setProperties({ type: 'highlight', class: 'alv switch active' });
  }

  destroy() {
    for (var mark of this.marks)
      mark.destroy();
  }
}

export const highlight = (client, node, outSet) => {
  const tagNode = getChildOfType(node, 'tag');
  if (!tagNode)
    return Promise.resolve(null);

  const tag = parseInt(tagNode.text.substr(1, tagNode.text.length-2));

  return client
    .sendTx({ type: 'info', tag })
    .then(info => {
      const main = new TagHighlight(client, info, tagNode);
      if (info.vis.active)
        main.subhls.add(new ActiveHighlight(client, info, node));

      outSet.add(main);
    });
};
