'use babel';

const getChildOfType = (node, type) => {
  const matches = node.children.filter(c => c.type == type);
  if (matches.length > 1)
    throw new Error(`more than one ${type} child`);

  return matches.length > 0 ? matches[0] : null;
}

export class NullWidget {
  constructor(client, widgetNode) {
    this.widgetNode = widgetNode;

    this.element = document.createElement('div');
    this.element.classList.add('alv--null');

    this.widgetNode.appendChild(this.element);
  }

  update(info) {}

  destroy() {
    this.widgetNode.removeChild(this.element);
  }
}


export class EventWidget {
  constructor(client, widgetNode) {
    this.client = client;
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

export class ColorWidget {
  constructor(client, widgetNode, info) {
    this.widgetNode = widgetNode;

    this.element = document.createElement('div');
    this.element.classList.add('alv--color');
    this.widgetNode.appendChild(this.element);
    this.update(info);
  }

  update(info) {
    let [r, g, b, a] = info.vis.rgb;

    let color;
    if (a == null)
      a = 1;

    color = `rgba(${r*256}, ${g*256}, ${b*256}, ${a})`;

    this.element.style.backgroundColor = color;
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
    this.mark = editor.markBufferRange(tagNode.range, { persistent: false, invalidate: 'inside' });

    const element = document.createElement('a');
    element.classList.add('alv--tag');
    element.innerText = tagNode.text;
    element.href = '#';
    element.onclick = e => this.toggleWidget();

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

   this.cover = editor.decorateMarker(this.mark, {
      type: 'text',
      style: { color: 'transparent' },
   });

   this.noWidget = true;
   this.toggleWidget();
  }

  toggleWidget() {
    this.noWidget = !this.noWidget;

    const WidgetClass = this.noWidget ? NullWidget : this.getWidgetClass();

    if (this.widget)
      this.widget.destroy();
    this.widget = new WidgetClass(this.client, this.wrapper, this.info);
  }

  getWidgetClass() {
    console.info(this.info.vis);
    const vis = this.info.vis;
    if (vis == null || vis.type == null)
      return NullWidget;

    switch (vis.type) {
      case 'event': return EventWidget;
      case 'bool': return BoolWidget;
      case 'bar': return BarWidget;
      case 'rgb': return ColorWidget;
    }

    return NullWidget;
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

export class StepHighlight {
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

      this.lastStep = -1;
    }
  }

  update(info) {
    const last = this.decos[this.lastStep];
    if (last)
      last.setProperties({ type: 'highlight', class: 'alv step' });

    this.lastStep = info.vis.step;
    const next = this.decos[this.lastStep];
    if (next)
      next.setProperties({ type: 'highlight', class: 'alv step active' });
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
      if (info.vis && info.vis.step)
        main.subhls.add(new StepHighlight(client, info, node));

      outSet.add(main);
    });
};
