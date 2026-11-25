import { Position } from './map';
import { element } from './text';
import { Box } from './canvas-arrange';

export interface MinimapContent {
  frames: { box: Box; tint?: string }[];
  cards: { box: Box; status?: string }[];
}
export interface Minimap {
  element: HTMLElement;
  /** Redraws the areas and cards, e.g. after a card moved or a decision changed. */
  draw(content: MinimapContent): void;
  /** Moves the rectangle that stands for the part of the map on screen (world coordinates). */
  view(rect: Box): void;
}

const WIDTH = 168,
  HEIGHT = 100,
  PAD = 6;
const svgNs = 'http://www.w3.org/2000/svg';

/**
 * A small drawing of the whole map with the part on screen outlined. Pressing or dragging on it moves the map there
 * (pointer only: the map itself already pans with the arrow keys, so the drawing is an image to assistive tech).
 */
export function minimap(onPan: (world: Position) => void): Minimap {
  const root = element('div', undefined, 'canvas-minimap'),
    svg = document.createElementNS(svgNs, 'svg'),
    content = document.createElementNS(svgNs, 'g'),
    frame = document.createElementNS(svgNs, 'rect');
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', '縮圖導覽');
  root.title = '縮圖導覽：點一下或拖曳，移到那一區';
  svg.setAttribute('width', String(WIDTH));
  svg.setAttribute('height', String(HEIGHT));
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('aria-hidden', 'true');
  frame.setAttribute('class', 'minimap-view');
  frame.setAttribute('rx', '3');
  svg.append(content, frame);
  root.append(svg);
  let scale = 1,
    dx = 0,
    dy = 0,
    last: Box | undefined;
  const view = (rect: Box) => {
    last = rect;
    frame.setAttribute('x', String(dx + rect.x * scale));
    frame.setAttribute('y', String(dy + rect.y * scale));
    frame.setAttribute('width', String(Math.max(4, rect.width * scale)));
    frame.setAttribute('height', String(Math.max(4, rect.height * scale)));
  };
  const draw = ({ frames, cards }: MinimapContent) => {
    const boxes = [...frames.map((f) => f.box), ...cards.map((c) => c.box)];
    content.replaceChildren();
    if (!boxes.length) return;
    const left = Math.min(...boxes.map((b) => b.x)),
      top = Math.min(...boxes.map((b) => b.y)),
      right = Math.max(...boxes.map((b) => b.x + b.width)),
      bottom = Math.max(...boxes.map((b) => b.y + b.height));
    scale = Math.min(
      (WIDTH - 2 * PAD) / (right - left || 1),
      (HEIGHT - 2 * PAD) / (bottom - top || 1),
    );
    dx = (WIDTH - (right - left) * scale) / 2 - left * scale;
    dy = (HEIGHT - (bottom - top) * scale) / 2 - top * scale;
    const rect = (box: Box, className: string) => {
      const r = document.createElementNS(svgNs, 'rect');
      r.setAttribute('x', String(dx + box.x * scale));
      r.setAttribute('y', String(dy + box.y * scale));
      r.setAttribute('width', String(Math.max(1.5, box.width * scale)));
      r.setAttribute('height', String(Math.max(1.5, box.height * scale)));
      r.setAttribute('class', className);
      content.append(r);
      return r;
    };
    for (const f of frames) {
      const r = rect(f.box, 'minimap-frame');
      r.setAttribute('rx', '3');
      if (f.tint) r.dataset.roleTint = f.tint;
    }
    for (const c of cards) {
      const r = rect(c.box, 'minimap-card');
      if (c.status) r.dataset.status = c.status;
    }
    if (last) view(last);
  };
  const toWorld = (event: PointerEvent): Position => {
    const r = svg.getBoundingClientRect();
    return { x: (event.clientX - r.left - dx) / scale, y: (event.clientY - r.top - dy) / scale };
  };
  let pressed = false;
  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    pressed = true;
    root.setPointerCapture(event.pointerId);
    onPan(toWorld(event));
  });
  root.addEventListener('pointermove', (event) => {
    if (pressed) onPan(toWorld(event));
  });
  for (const name of ['pointerup', 'pointercancel'])
    root.addEventListener(name, () => {
      pressed = false;
    });
  return { element: root, draw, view };
}
