import { iconButton, icon } from './shell-ui';
import { partitionNavigation, flowLayout, roundedPath, commonDestinations } from './overview';
import { groupedLayout, crossPoints, areaPreview, GroupedLayout } from './groups';
import { focusedRelations, FocusRelation, sharedNavigation } from './relations';
import { Index, Position, fileEntries, searchScreens } from './map';
import { Payload } from './contracts';
import { element, text } from './text';
import { PersonaView, lineKey, reachLabel, reachHelp } from './personas';

export interface CanvasTransform {
  zoom: number;
  x: number;
  y: number;
}
export interface CanvasState {
  query: string;
  visible?: Set<string>;
  screenStatus: (id: string) => string;
  persona?: PersonaView;
}
export interface CanvasOptions extends CanvasState {
  transform?: CanvasTransform;
  onTransformChange?: (state: CanvasTransform) => void;
  /** The person picked a screen: a card or an overview line. */
  onOpen: (id: string) => void;
  /** The person is pointing at a screen they may open next, so its preview can be prepared ahead. */
  onIntent?: (id: string) => void;
  /** Lays the map out this way instead of by URL areas, e.g. a persona's flow by step. */
  layout?: GroupedLayout;
  /** Shown in the top-left corner of the overview, e.g. the persona switch. */
  toolbar?: HTMLElement;
}
export interface CanvasView {
  element: HTMLElement;
  update(state: CanvasState): void;
}

const CARD = { width: 250, height: 220 },
  MOTION_MS = 450,
  DENSE_SCREENS = 20;
/** Same curve as the side panels' width transition, so the canvas and the panels move as one. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const svgNs = 'http://www.w3.org/2000/svg';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Lines leaving the focused screen: its screen-specific flows (as drawn on the overview) plus one stub per trigger whose destination is unknown. */
export function focusLines(index: Index, id: string): FocusRelation[] {
  const flows: FocusRelation[] = partitionNavigation(index).flows.filter((r) => r.from === id);
  const unresolved = focusedRelations(index, id)
    .filter((r) => r.unresolved)
    .flatMap((r) =>
      r.triggers.length
        ? r.triggers.map((trigger) => ({ ...r, triggers: [trigger], to: `unresolved:${trigger}` }))
        : [r],
    );
  return [...flows, ...unresolved];
}

/** Screen Map: every screen as a card on one pannable canvas; opening a screen is left to onOpen. */
export function canvas(index: Index, payload: Payload, options: CanvasOptions): CanvasView {
  const viewport = element('div', undefined, 'canvas'),
    world = element('div', undefined, 'world'),
    controls = element('div', undefined, 'canvas-controls');
  viewport.tabIndex = 0;
  viewport.setAttribute('aria-label', text.canvas);
  viewport.dataset.mode = 'overview';
  let state: CanvasState = {
    query: options.query,
    visible: options.visible,
    screenStatus: options.screenStatus,
    persona: options.persona,
  };
  let zoom = options.transform?.zoom ?? 1,
    x = options.transform?.x ?? 0,
    y = options.transform?.y ?? 0;
  let frameId = 0;
  // The name and route of a screen pointed at on the zoomed-out map, where the cards are too small to read.
  const cardTip = element('div', undefined, 'card-tip');
  cardTip.hidden = true;
  cardTip.setAttribute('aria-hidden', 'true');
  const apply = () => {
    cardTip.hidden = true;
    world.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    // Card and area borders divide by this so they stay one screen pixel at any zoom instead of vanishing when zoomed out.
    world.style.setProperty('--zoom', String(zoom));
    viewport.dataset.semanticZoom = zoom < 0.7 ? 'compact' : 'detail';
    if (viewport.dataset.fitted === 'true') options.onTransformChange?.({ zoom, x, y });
  };
  // Many screens are shown as areas by URL; a small map keeps one flow layout.
  const grouped = options.layout ?? groupedLayout(index),
    layout = grouped ?? flowLayout(index),
    positions = layout.positions;
  const width = Math.max(800, layout.width),
    height = Math.max(600, layout.height);
  world.style.width = `${width}px`;
  world.style.height = `${height}px`;
  const visible = (id: string) => !state.visible || state.visible.has(id);
  // Fitting keeps the map below the toolbar in the top-left corner so it never covers an area's title.
  const reserved = () => {
    const top = viewport.querySelector<HTMLElement>('.canvas-top');
    return top ? Math.max(24, top.offsetTop + top.offsetHeight + 8) : 24;
  };
  const frameRect = (left: number, top: number, w: number, h: number): CanvasTransform => {
    const above = reserved(),
      room = viewport.clientHeight - above - 24,
      z = Math.min(1, (viewport.clientWidth - 48) / w, room / h);
    return {
      zoom: z,
      x: (viewport.clientWidth - w * z) / 2 - (left - 40) * z,
      y: above + (room - h * z) / 2 - (top - 40) * z,
    };
  };
  const fit = () => {
    if (!viewport.clientWidth || !viewport.clientHeight) return;
    const shown = index.screens.filter((s) => visible(s.id)).map((s) => positions.get(s.id)!);
    if (!shown.length) return;
    const boxes = (grouped?.groups || []).filter((g) => g.members.some(visible)).map((g) => g.box);
    const left = Math.min(...shown.map((p) => p.x), ...boxes.map((b) => b.x)),
      top = Math.min(...shown.map((p) => p.y), ...boxes.map((b) => b.y)),
      right = Math.max(...shown.map((p) => p.x + CARD.width), ...boxes.map((b) => b.x + b.width)),
      bottom = Math.max(
        ...shown.map((p) => p.y + CARD.height),
        ...boxes.map((b) => b.y + b.height),
      );
    const w = right - left + 80,
      h = bottom - top + 80;
    ({ zoom, x, y } = frameRect(left, top, w, h));
    viewport.dataset.fitted = 'true';
    apply();
  };
  const change = (ratio: number) => {
    zoom = Math.max(0.1, Math.min(4, zoom * ratio));
    viewport.dataset.fitted = 'true';
    apply();
  };
  /** Zooms keeping the world point under (clientX, clientY) where it is, so a pinch zooms into what the fingers are on. */
  const zoomAt = (ratio: number, clientX: number, clientY: number) => {
    const r = viewport.getBoundingClientRect(),
      px = clientX - r.left,
      py = clientY - r.top,
      next = Math.max(0.1, Math.min(4, zoom * ratio)),
      k = next / zoom;
    x = px - (px - x) * k;
    y = py - (py - y) * k;
    zoom = next;
    viewport.dataset.fitted = 'true';
    apply();
  };
  for (const [label, name, action] of [
    [text.zoomIn, 'zoom', () => change(1.2)],
    [text.zoomOut, 'minus', () => change(1 / 1.2)],
    [text.reset, 'fit', fit],
  ] as const) {
    const button = iconButton(label, name);
    button.onclick = action;
    controls.append(button);
  }

  // ---- overview: cards and their flows
  const svg = document.createElementNS(svgNs, 'svg');
  // Arrowheads keep one size and take the colour of their line's state (see .relation-line in viewer.css).
  const marker = (id: string) =>
    `<marker id="${id}" class="flow-marker" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><path d="M1,1 L9,5 L1,9 Z"/></marker>`;
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.classList.add('relations');
  // With many screens the lines step back until a screen or a line is pointed at.
  if (index.screens.length > DENSE_SCREENS) svg.classList.add('is-dense');
  svg.innerHTML = `<defs>${['flow-arrow', 'flow-arrow-out', 'flow-arrow-in', 'flow-arrow-muted'].map(marker).join('')}</defs>`;
  // Highlighted lines are repainted in a top layer; moving the hovered element itself would lose its mouseleave.
  const raised = document.createElementNS(svgNs, 'g');
  raised.setAttribute('class', 'relation-raised');
  raised.setAttribute('aria-hidden', 'true');
  /** Lines leaving the pointed screen are drawn as outgoing, lines arriving as incoming; the rest step back. */
  const highlight = (out: Set<Element>, into: Set<Element>, ids: Set<string>) => {
    raised.replaceChildren();
    svg.classList.add('is-highlighting');
    svg.querySelectorAll<SVGPathElement>('.relation-line').forEach((line) => {
      const leaving = out.has(line),
        arriving = !leaving && into.has(line);
      line.classList.toggle('is-out', leaving);
      line.classList.toggle('is-in', arriving);
      line.classList.toggle('is-muted', !leaving && !arriving);
      if (leaving || arriving) {
        const copy = line.cloneNode() as SVGPathElement;
        copy.removeAttribute('tabindex');
        copy.removeAttribute('role');
        copy.removeAttribute('aria-label');
        raised.append(copy);
      }
    });
    world.querySelectorAll<HTMLElement>('.screen-card').forEach((card) => {
      const on = ids.has(card.dataset.screen!);
      card.classList.toggle('is-highlighted', on);
      card.classList.toggle('is-muted', !on);
    });
  };
  // A screen chosen with a single click keeps its lines drawn until a blank click or Esc.
  let pinned: string | undefined,
    dragged = false;
  const settle = () => {
    if (pinned) linkedFor(pinned);
    else clear();
  };
  const clear = () => {
    svg.classList.remove('is-highlighting');
    raised.replaceChildren();
    svg
      .querySelectorAll('.relation-line')
      .forEach((line) => line.classList.remove('is-out', 'is-in', 'is-muted'));
    world
      .querySelectorAll('.screen-card')
      .forEach((card) => card.classList.remove('is-highlighted', 'is-muted'));
  };
  for (const { relation, points } of layout.routes) {
    const group = document.createElementNS(svgNs, 'g'),
      hit = document.createElementNS(svgNs, 'path') as SVGPathElement,
      line = document.createElementNS(svgNs, 'path') as SVGPathElement,
      d = roundedPath(points);
    group.setAttribute('class', 'relation');
    hit.setAttribute('d', d);
    hit.setAttribute('class', 'relation-hit');
    hit.setAttribute('aria-hidden', 'true');
    line.setAttribute('d', d);
    line.setAttribute('class', 'relation-line');
    line.dataset.from = relation.from;
    line.dataset.to = relation.to;
    line.setAttribute('tabindex', '0');
    line.setAttribute('role', 'button');
    line.setAttribute(
      'aria-label',
      `${index.nodes.get(relation.from)!.name} → ${index.nodes.get(relation.to)!.name}`,
    );
    // Every screen is already visible on the overview, so pointing at a line only highlights it and its two ends.
    const show = () => highlight(new Set([line]), new Set(), new Set([relation.from, relation.to]));
    group.addEventListener('mouseenter', show);
    group.addEventListener('mouseleave', () => settle());
    group.addEventListener('click', () => options.onOpen(relation.to));
    line.addEventListener('focus', show);
    line.addEventListener('blur', () => settle());
    line.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Enter') options.onOpen(relation.to);
    });
    group.append(hit, line);
    svg.append(group);
  }
  if (grouped) {
    // Area frames sit behind everything; each pair of areas gets one line with the number of flows it stands for.
    for (const group of grouped.groups) {
      const frame = element('div', undefined, 'screen-group');
      frame.dataset.group = group.key;
      if (group.tint) frame.dataset.roleTint = group.tint;
      frame.title = `${group.label}：點一下放大這一區`;
      Object.assign(frame.style, {
        left: `${group.box.x}px`,
        top: `${group.box.y}px`,
        width: `${group.box.width}px`,
        height: `${group.box.height}px`,
      });
      // The label keeps a readable size however far the map is zoomed out (see .screen-group-label); its second line,
      // the area's first screens in reading order, is shown only while the cards are too small to read.
      const names = group.members
        .filter((id) => positions.has(id))
        .sort(
          (a, b) =>
            positions.get(a)!.y - positions.get(b)!.y || positions.get(a)!.x - positions.get(b)!.x,
        )
        .map((id) => index.nodes.get(id)?.name || '');
      // Only the overview's URL areas have the taller band (TITLE in groups.ts) these need; a supplied layout, such as a
      // persona's step columns, keeps its plain title at the map's own scale.
      const label = element('div', undefined, 'screen-group-label');
      label.style.setProperty('--label-room', `${group.box.width - 40}px`);
      label.append(element('span', group.label, 'screen-group-title'));
      if (options.layout) label.classList.add('is-plain');
      else label.append(element('span', areaPreview(names), 'screen-group-names'));
      frame.append(label);
      world.append(frame);
      // Links between areas are only shown for the area being pointed at.
      const showLinks = (on: boolean) => {
        world
          .querySelectorAll<HTMLElement | SVGElement>('.group-link,.group-link-count')
          .forEach((node) =>
            node.classList.toggle(
              'is-shown',
              on && (node.dataset.from === group.key || node.dataset.to === group.key),
            ),
          );
      };
      frame.addEventListener('mouseenter', () => showLinks(true));
      frame.addEventListener('mouseleave', () => showLinks(false));
    }
    const labelOf = new Map(grouped.groups.map((g) => [g.key, g.label.split(' · ')[0]]));
    for (const link of grouped.links) {
      const g = document.createElementNS(svgNs, 'g'),
        line = document.createElementNS(svgNs, 'path') as SVGPathElement,
        count = link.relations.length;
      // The count sits on the route's longest horizontal run, where it reads clearly and no area is behind it.
      const runs = link.points
          .slice(1)
          .map((p, i) => ({ a: link.points[i], b: p }))
          .filter((r) => r.a.y === r.b.y)
          .sort((r, q) => Math.abs(q.b.x - q.a.x) - Math.abs(r.b.x - r.a.x)),
        run = runs[0] || { a: link.points[0], b: link.points[link.points.length - 1] };
      const a = { x: run.a.x, y: run.a.y },
        b = { x: run.b.x, y: run.b.y };
      g.setAttribute('class', 'group-link');
      line.setAttribute('d', roundedPath(link.points, 10));
      line.setAttribute('class', 'group-link-line');
      line.style.strokeWidth = String(Math.min(8, 2 + Math.log2(count) * 1.5));
      const title = document.createElementNS(svgNs, 'title');
      title.textContent = `${labelOf.get(link.from)} → ${labelOf.get(link.to)}：${count} 條`;
      g.append(title, line);
      svg.append(g);
      const badge = element('span', String(count), 'group-link-count');
      badge.title = title.textContent;
      Object.assign(badge.style, { left: `${(a.x + b.x) / 2}px`, top: `${(a.y + b.y) / 2}px` });
      world.append(badge);
      const crossing = () => {
        const out = new Set<Element>(),
          ids = new Set<string>();
        for (const r of link.relations) {
          svg
            .querySelectorAll<SVGPathElement>(
              `.relation-line.cross[data-from="${CSS.escape(r.from)}"][data-to="${CSS.escape(r.to)}"]`,
            )
            .forEach((l) => out.add(l));
          ids.add(r.from);
          ids.add(r.to);
        }
        highlight(out, new Set(), ids);
      };
      g.dataset.from = link.from;
      g.dataset.to = link.to;
      badge.dataset.from = link.from;
      badge.dataset.to = link.to;
      for (const target of [g, badge]) {
        target.addEventListener('mouseenter', crossing);
        target.addEventListener('mouseleave', () => settle());
      }
    }
    // Each flow between areas also exists as its own line, hidden until one of its screens is pointed at.
    for (const relation of grouped.cross) {
      const line = document.createElementNS(svgNs, 'path') as SVGPathElement,
        [a, b] = crossPoints(positions, relation);
      line.setAttribute('d', `M${a.x},${a.y} L${b.x},${b.y}`);
      line.setAttribute('class', 'relation-line cross');
      line.setAttribute('aria-hidden', 'true');
      line.dataset.from = relation.from;
      line.dataset.to = relation.to;
      svg.append(line);
    }
  }
  svg.append(raised);
  world.append(svg);
  const cards = new Map<string, HTMLButtonElement>();
  /** Shown below the card (above it near the bottom edge), only while the map is zoomed out. */
  const showCardTip = (card: HTMLElement, name: string, route: string) => {
    if (viewport.dataset.semanticZoom !== 'compact') {
      cardTip.hidden = true;
      return;
    }
    cardTip.replaceChildren(element('strong', name), element('span', route));
    const r = card.getBoundingClientRect(),
      v = viewport.getBoundingClientRect(),
      half = Math.min(150, v.width / 2);
    const below = r.bottom - v.top + 72 < v.height;
    cardTip.style.left = `${Math.min(v.width - half, Math.max(half, r.left - v.left + r.width / 2))}px`;
    cardTip.style.top = `${below ? r.bottom - v.top + 6 : r.top - v.top - 6}px`;
    cardTip.dataset.side = below ? 'below' : 'above';
    cardTip.hidden = false;
  };
  for (const screen of index.screens) {
    const p = positions.get(screen.id)!,
      card = element('button', undefined, 'screen-card'),
      route = index.routes.get(screen.id)?.[0] || text.noUrl;
    card.dataset.screen = screen.id;
    card.style.left = `${p.x}px`;
    card.style.top = `${p.y}px`;
    const thumb = payload.preview.screens?.find((s) => s.graphScreenId === screen.id)?.thumbnail;
    if (thumb?.startsWith('data:image/')) {
      const img = element('img', undefined, 'card-preview');
      img.src = thumb;
      img.alt = screen.name;
      if (index.screens.length > 150) {
        img.loading = 'lazy';
        img.decoding = 'async';
      }
      card.append(img);
    } else {
      const missing = element('div', undefined, 'card-preview missing-preview');
      missing.append(element('span', text.noPreview));
      card.append(missing);
    }
    const caption = element('div', undefined, 'screen-caption'),
      routeLabel = element('span', route, 'screen-route');
    routeLabel.title = route;
    caption.append(element('strong', screen.name), routeLabel);
    card.append(caption);
    // Header/footer links are not drawn on the overview; a badge still tells that this screen is reachable from them.
    const entries = sharedNavigation(index, screen.id, false).into.length;
    const common = commonDestinations(index).get(screen.id)?.length || 0;
    if (common) {
      const badge = element('span', `${common}`, 'common-entry');
      badge.setAttribute('role', 'img');
      const label = `可從 ${common} 個畫面直接前往（總覽不逐一畫線，放大畫面時顯示）`;
      badge.setAttribute('aria-label', label);
      badge.title = label;
      badge.dataset.count = String(common);
      if (entries) badge.classList.add('after-shared');
      card.append(badge);
    }
    if (entries) {
      const badge = icon('menu');
      badge.classList.add('shared-entry');
      badge.setAttribute('role', 'img');
      const label = `可從 ${entries} 個畫面的頁首／頁尾連結進入`;
      badge.setAttribute('aria-label', label);
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = label;
      badge.append(title);
      badge.dataset.count = String(entries);
      card.append(badge);
    }
    card.onmouseenter = card.onfocus = () => linkedFor(screen.id);
    card.onmouseleave = card.onblur = () => settle();
    const tip = () => showCardTip(card, screen.name, route),
      untip = () => {
        cardTip.hidden = true;
      };
    card.addEventListener('mouseenter', tip);
    card.addEventListener('focus', tip);
    card.addEventListener('mouseleave', untip);
    card.addEventListener('blur', untip);
    card.addEventListener('pointerenter', () => {
      if (!frameId) options.onIntent?.(screen.id);
    });
    // One click shows where this screen leads and who leads here; a second click (a double click) opens it.
    card.onclick = (event) => {
      if (event.detail === 0) return;
      event.stopPropagation();
      pin(screen.id);
    };
    card.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        options.onOpen(screen.id);
      } else if (event.key === ' ') {
        event.preventDefault();
        pin(screen.id);
      }
    };
    world.append(card);
    cards.set(screen.id, card);
  }
  /** The pointed or pinned screen's lines, every one of them including those to other areas. */
  function linkedFor(id: string) {
    const out = new Set<Element>(),
      into = new Set<Element>(),
      ids = new Set([id]);
    svg.querySelectorAll<SVGPathElement>('.relation-line').forEach((line) => {
      const leaving = line.dataset.from === id,
        arriving = line.dataset.to === id;
      if (leaving) out.add(line);
      else if (arriving) into.add(line);
      if (leaving || arriving) {
        ids.add(line.dataset.from!);
        ids.add(line.dataset.to!);
      }
    });
    highlight(out, into, ids);
    return ids;
  }
  const DOUBLE_CLICK_MS = 300;
  let lastClick: { id: string; time: number } | undefined;
  const pin = (id: string) => {
    pinned = id;
    lastClick = { id, time: performance.now() };
    for (const [cardId, card] of cards) card.classList.toggle('is-pinned', cardId === id);
    const ids = linkedFor(id),
      shown = [...ids].map((other) => positions.get(other)).filter((p): p is Position => !!p);
    zoomTo({
      x: Math.min(...shown.map((p) => p.x)),
      y: Math.min(...shown.map((p) => p.y)),
      width: Math.max(...shown.map((p) => p.x + CARD.width)) - Math.min(...shown.map((p) => p.x)),
      height: Math.max(...shown.map((p) => p.y + CARD.height)) - Math.min(...shown.map((p) => p.y)),
    });
  };
  const unpin = () => {
    pinned = undefined;
    for (const card of cards.values()) card.classList.remove('is-pinned');
    clear();
  };
  /** Eases the overview onto a world rectangle, with the same margins as fitting the whole map. */
  const zoomTo = (rect: { x: number; y: number; width: number; height: number }) => {
    if (!viewport.clientWidth || !viewport.clientHeight) return;
    const target = frameRect(rect.x, rect.y, rect.width + 80, rect.height + 80);
    viewport.dataset.fitted = 'true';
    if (reducedMotion()) {
      ({ zoom, x, y } = target);
      apply();
      return;
    }
    animate(
      () => target,
      { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
      () => {},
      () => {},
    );
  };
  // The second click of a double click may land elsewhere once the map has moved; it still opens the first card.
  // Only clicks on the map itself count: not the preview, its back button, tooltips or the zoom controls.
  const onMap = (event: Event) => event.target === viewport || world.contains(event.target as Node);
  viewport.addEventListener(
    'click',
    (event) => {
      if (
        !onMap(event) ||
        !lastClick ||
        event.detail < 2 ||
        performance.now() - lastClick.time > DOUBLE_CLICK_MS
      )
        return;
      event.stopPropagation();
      event.preventDefault();
      const id = lastClick.id;
      lastClick = undefined;
      options.onOpen(id);
    },
    true,
  );
  // A click that is not a drag: on an area it zooms into the area, elsewhere it lets go of a pinned screen.
  // Panning captures the pointer, so the click arrives here and the area is found under the pointer.
  viewport.addEventListener('click', (event) => {
    if (
      !onMap(event) ||
      frameId ||
      dragged ||
      (event.target as Element).closest('.screen-card,.relation,.group-link,.group-link-count')
    )
      return;
    const area = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find((node) => node.classList.contains('screen-group')) as HTMLElement | undefined;
    const group = area && grouped?.groups.find((g) => g.key === area.dataset.group);
    if (pinned) unpin();
    if (group) zoomTo(group.box);
  });
  viewport.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && pinned) {
      event.stopPropagation();
      unpin();
    }
  });
  const sameSet = (a?: Set<string>, b?: Set<string>) =>
    a === b || (!!a && !!b && a.size === b.size && [...a].every((id) => b.has(id)));
  const update = (next: CanvasState) => {
    const refit = !sameSet(next.visible, state.visible);
    state = next;
    const matches = searchScreens(index, state.query);
    for (const [id, card] of cards) {
      card.hidden = !visible(id);
      card.classList.toggle('search-match', !!state.query && matches.has(id));
      const status = state.screenStatus(id);
      card.querySelector('.review-status-icon')?.remove();
      if (status === 'KEEP' || status === 'REMOVE') {
        card.dataset.screenStatus = status;
        const mark = icon(status === 'KEEP' ? 'check' : 'close');
        mark.classList.add('review-status-icon');
        mark.setAttribute('role', 'img');
        mark.setAttribute('aria-label', status === 'KEEP' ? text.keep : text.remove);
        card.append(mark);
      } else delete card.dataset.screenStatus;
      // The chosen persona's view of the screen: its frame says whether it is reached; a badge names anything less than certain.
      card.querySelector('.persona-badge')?.remove();
      if (state.persona) {
        const reach = state.persona.reach.get(id)!;
        card.dataset.personaReach = reach;
        if (reach !== 'REACHABLE') {
          const badge = element('span', reachLabel[reach], 'persona-badge');
          badge.dataset.reach = reach;
          badge.title = reachHelp[reach];
          card.append(badge);
        }
      } else delete card.dataset.personaReach;
    }
    // A supplied layout drops the areas whose screens are all hidden, so hidden columns leave no empty frame.
    if (options.layout)
      for (const group of options.layout.groups) {
        const frame = world.querySelector<HTMLElement>(
          `.screen-group[data-group="${CSS.escape(group.key)}"]`,
        );
        if (frame) frame.hidden = !group.members.some(visible);
      }
    svg.classList.toggle('has-persona', !!state.persona);
    svg.querySelectorAll<SVGPathElement>('.relation-line').forEach((line) => {
      (line.parentNode as SVGGElement).style.display =
        visible(line.dataset.from!) && visible(line.dataset.to!) ? '' : 'none';
      if (state.persona)
        line.dataset.persona =
          state.persona.lines.get(lineKey(line.dataset.from!, line.dataset.to!)) || 'OFF';
      else delete line.dataset.persona;
    });
    if (refit) fit();
  };

  const origin = () => {
    const r = viewport.getBoundingClientRect();
    return { left: r.left, top: r.top };
  };
  /** Moves the world to target(), re-read every frame because the side panels resize the canvas meanwhile; scale changes geometrically around anchor. */
  const animate = (
    target: () => CanvasTransform,
    anchor: { x: number; y: number },
    frame: (t: number) => void,
    done: () => void,
  ) => {
    cancelAnimationFrame(frameId);
    const o = origin(),
      from = { zoom, x: x + o.left, y: y + o.top };
    let start: number | undefined;
    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / MOTION_MS),
        e = ease(t),
        here = origin(),
        local = target(),
        to = { zoom: local.zoom, x: local.x + here.left, y: local.y + here.top };
      const z = from.zoom * Math.pow(to.zoom / from.zoom, e);
      const ax =
          from.x +
          anchor.x * from.zoom +
          (to.x + anchor.x * to.zoom - from.x - anchor.x * from.zoom) * e,
        ay =
          from.y +
          anchor.y * from.zoom +
          (to.y + anchor.y * to.zoom - from.y - anchor.y * from.zoom) * e;
      if (t < 1) {
        zoom = z;
        x = ax - anchor.x * z - here.left;
        y = ay - anchor.y * z - here.top;
      } else ({ zoom, x, y } = local);
      apply();
      frame(t);
      if (t < 1) frameId = requestAnimationFrame(step);
      else {
        frameId = 0;
        done();
      }
    };
    frameId = requestAnimationFrame(step);
  };
  viewport.addEventListener('keydown', (event) => {
    if (event.target !== viewport) return;
    const step = 50;
    if (event.key === '+' || event.key === '=') change(1.2);
    else if (event.key === '-') change(1 / 1.2);
    else if (event.key === 'ArrowLeft') x += step;
    else if (event.key === 'ArrowRight') x -= step;
    else if (event.key === 'ArrowUp') y += step;
    else if (event.key === 'ArrowDown') y -= step;
    else return;
    event.preventDefault();
    apply();
  });
  let dragging: { x: number; y: number } | undefined,
    travel = 0;
  viewport.addEventListener('pointerdown', (event) => {
    dragged = false;
    travel = 0;
    if ((event.target as Element).closest('button,.relation,.canvas-top')) return;
    dragging = { x: event.clientX, y: event.clientY };
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    travel += Math.abs(event.clientX - dragging.x) + Math.abs(event.clientY - dragging.y);
    if (travel > 4) dragged = true;
    x += event.clientX - dragging.x;
    y += event.clientY - dragging.y;
    dragging = { x: event.clientX, y: event.clientY };
    apply();
  });
  for (const name of ['pointerup', 'pointercancel'])
    viewport.addEventListener(name, () => {
      dragging = undefined;
    });
  viewport.addEventListener(
    'wheel',
    (event) => {
      // A pinch arrives as a wheel event with ctrlKey; ⌘/Ctrl with a mouse wheel zooms the same way. Any other scroll —
      // two fingers on a trackpad, or a mouse wheel — moves the map.
      const zooming = event.ctrlKey || event.metaKey;
      event.preventDefault();
      if (frameId) return; // the map is easing somewhere (onto a pinned screen or an area); let it arrive
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      if (zooming) {
        zoomAt(
          Math.exp(-Math.max(-50, Math.min(50, event.deltaY * unit)) * 0.01),
          event.clientX,
          event.clientY,
        );
        return;
      }
      x -= event.deltaX * unit;
      y -= event.deltaY * unit;
      viewport.dataset.fitted = 'true';
      apply();
    },
    { passive: false },
  );
  viewport.append(world, cardTip, controls);
  if (options.toolbar) {
    const top = element('div', undefined, 'canvas-top');
    top.append(options.toolbar);
    viewport.append(top);
  }
  update(state);
  apply();
  let observed: { width: number; height: number } | undefined;
  new ResizeObserver((entries) => {
    const size = entries[0]?.contentRect;
    if (!size) return;
    const changed =
      !!observed && (size.width !== observed.width || size.height !== observed.height);
    observed = { width: size.width, height: size.height };
    if (!changed || frameId) return;
    if (!options.transform) fit();
  }).observe(viewport);
  requestAnimationFrame(() => {
    if (options.transform) {
      viewport.dataset.fitted = 'true';
      apply();
    } else fit();
  });
  return {
    element: viewport,
    update,
  };
}

/** File structure view of the screens, grouped by their source folders. */
export function fileTree(
  index: Index,
  query: string,
  onFocus: (id: string) => void,
  options: { visible?: Set<string>; current?: string } = {},
): HTMLElement {
  const root = element('div', undefined, 'file-tree'),
    matches = searchScreens(index, query);
  // Folders → files → the screens each file shows. Folder chains with nothing else in them
  // read as one path (`src/main/webapp/WEB-INF/views`).
  interface Folder {
    folders: Map<string, Folder>;
    files: Map<string, { screenId: string; layout?: string }[]>;
  }
  const tree: Folder = { folders: new Map(), files: new Map() };
  for (const item of fileEntries(index)) {
    if (options.visible && !options.visible.has(item.screenId)) continue;
    if (query && !matches.has(item.screenId)) continue;
    const parts = item.path.split('/');
    let folder = tree;
    for (const name of parts.slice(0, -1)) {
      if (!folder.folders.has(name))
        folder.folders.set(name, { folders: new Map(), files: new Map() });
      folder = folder.folders.get(name)!;
    }
    const file = parts.at(-1)!;
    folder.files.set(file, [...(folder.files.get(file) || []), item]);
  }
  const render = (folder: Folder, parent: HTMLElement) => {
    for (const [name, child] of folder.folders) {
      let label = name,
        inner = child;
      while (!inner.files.size && inner.folders.size === 1) {
        const [next, nested] = [...inner.folders][0];
        label += '/' + next;
        inner = nested;
      }
      const details = element('details'),
        children = element('div', undefined, 'folder');
      details.open = true;
      details.append(element('summary', label), children);
      parent.append(details);
      render(inner, children);
    }
    for (const [file, screens] of folder.files) {
      const group = element('div', undefined, 'file-group');
      group.append(element('div', file, 'file-name'));
      for (const item of screens) {
        const button = element('button', undefined, 'file-entry');
        button.dataset.screen = item.screenId;
        button.dataset.screenList = item.screenId;
        button.setAttribute('aria-current', options.current === item.screenId ? 'page' : 'false');
        button.append(
          element('strong', index.nodes.get(item.screenId)!.name),
          element('code', index.routes.get(item.screenId)?.[0] || '沒有已知 URL'),
        );
        if (item.layout) button.title = `版型：${item.layout}`;
        button.onclick = () => onFocus(item.screenId);
        group.append(button);
      }
      parent.append(group);
    }
  };
  render(tree, root);
  if (!root.childElementCount) root.append(element('p', '沒有符合的畫面', 'empty-list'));
  return root;
}
