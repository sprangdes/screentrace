import { Index } from './map';
import { element, text } from './text';
import { icon } from './shell-ui';
import { partitionNavigation } from './overview';
import { sharedNavigation } from './relations';
import { componentLabelsForScreen } from './labels';
import { focusLines } from './canvas';
import { apiEndpoints } from './api-page';
import { endpointMethod, endpointPath } from './endpoint-presentation';

/** Which flow rails beside the preview are open; kept by the caller so moving between screens keeps them. */
export interface RailState {
  in: boolean;
  out: boolean;
}
export interface StageOptions {
  rails: () => RailState;
  onRails: (rails: RailState) => void;
  open: (id: string) => void;
  /** The person points at a screen they may open next, so its preview can be prepared ahead. */
  intent?: (id: string) => void;
  /** Pointing at a card outlines its buttons in the preview; undefined clears them. */
  triggers: (components: string[] | undefined) => void;
  /** The screen's review decision, to warn when a way out leads to a screen marked for removal. */
  status: (id: string) => string;
}
export interface Stage {
  element: HTMLElement;
  /** Where the preview goes, between the rails. */
  host: HTMLElement;
  /** The row above the preview and the rails: history, trail, states and the demo-content switch. */
  top: HTMLElement;
  /** Marks the cards a button of the open screen leads along; undefined clears them. */
  light(component: string | undefined): void;
  /** Rebuilds the rails (decisions or rail state changed) without touching the preview. */
  update(): void;
  /** How many ways in and out the rails list, for the full-window toolbar. */
  counts: { in: number; out: number };
}

type Card = { other: string; triggers: string[] };

const endpoints = new WeakMap<Index, Set<string>>();
/** The APIs the given buttons call on their way, as 「POST /path」. */
function apisOf(index: Index, triggers: string[]): string[] {
  let known = endpoints.get(index);
  if (!known) endpoints.set(index, (known = new Set(apiEndpoints(index).map((n) => n.id))));
  const targets = new Set<string>();
  for (const trigger of triggers) {
    for (const e of index.graph.relationships || []) if (e.from === trigger) targets.add(e.to);
    for (const b of index.graph.behaviors || [])
      if (b.triggerId === trigger && b.targetId) targets.add(b.targetId);
  }
  return [...targets]
    .filter((id) => known!.has(id))
    .map((id) => index.nodes.get(id)!)
    .map((node) => `${endpointMethod(node)} ${endpointPath(node)}`)
    .sort();
}
const apiLine = (index: Index, triggers: string[], prefix: string) => {
  const apis = apisOf(index, triggers);
  return apis.length
    ? element(
        'span',
        `${prefix} ${apis.slice(0, 2).join('、')}${apis.length > 2 ? ' 等' : ''}`,
        'flow-card-api',
      )
    : undefined;
};
const navigation = new WeakMap<Index, ReturnType<typeof partitionNavigation>>();
const flowsOf = (index: Index) => {
  let found = navigation.get(index);
  if (!found) navigation.set(index, (found = partitionNavigation(index)));
  return found.flows;
};

/** One card per other screen, in name order, with every button of the relation that leads there. */
function gather(index: Index, items: { other: string; triggers: string[] }[]): Card[] {
  const cards = new Map<string, Card>();
  for (const item of items) {
    const card = cards.get(item.other) ?? { other: item.other, triggers: [] };
    for (const trigger of item.triggers)
      if (!card.triggers.includes(trigger)) card.triggers.push(trigger);
    cards.set(item.other, card);
  }
  return [...cards.values()].sort((a, b) =>
    (index.nodes.get(a.other)?.name || a.other).localeCompare(
      index.nodes.get(b.other)?.name || b.other,
      'zh-Hant',
    ),
  );
}

/**
 * The open screen as the main body of the review: its preview in the middle, the screens it is reached from on
 * the left and the screens it leads to on the right (ADR 0189). Both rails start folded to a tab with a count.
 */
export function reviewStage(index: Index, id: string, options: StageOptions): Stage {
  const root = element('div', undefined, 'review-stage'),
    top = element('div', undefined, 'review-top'),
    row = element('div', undefined, 'review-body'),
    host = element('div', undefined, 'review-preview');
  const labelsOf = (screen: string) => componentLabelsForScreen(index, screen);
  const via = (screen: string, triggers: string[]) => {
    const labels = labelsOf(screen),
      names = [...new Set(triggers.map((t) => labels.get(t)).filter((n): n is string => !!n))];
    return names.length
      ? `按「${names.slice(0, 2).join('」「')}」${names.length > 2 ? ' 等' : ''}`
      : '';
  };
  const lit: { card: HTMLElement; triggers: string[] }[] = [];
  const screenCard = (card: Card, side: 'in' | 'out') => {
    const button = element('button', undefined, `flow-card is-${side}`),
      name = index.nodes.get(card.other)?.name || card.other;
    button.type = 'button';
    button.dataset.flowCard = card.other;
    button.dataset.direction = side;
    button.append(element('strong', name));
    const how = via(side === 'in' ? card.other : id, card.triggers);
    if (how) button.append(element('span', how, 'flow-card-via'));
    const api = side === 'out' ? apiLine(index, card.triggers, '經') : undefined;
    if (api) button.append(api);
    if (side === 'out' && options.status(card.other) === 'REMOVE') {
      button.dataset.removed = 'true';
      button.append(element('span', '目的畫面已標記移除', 'flow-card-warn'));
    }
    button.onclick = () => options.open(card.other);
    button.onpointerenter = () => {
      options.intent?.(card.other);
      if (side === 'out') options.triggers(card.triggers);
    };
    button.onpointerleave = () => {
      if (side === 'out') options.triggers(undefined);
    };
    button.onfocus = () => {
      if (side === 'out') options.triggers(card.triggers);
    };
    button.onblur = () => {
      if (side === 'out') options.triggers(undefined);
    };
    if (side === 'out') lit.push({ card: button, triggers: card.triggers });
    return button;
  };
  const sharedGroup = (ids: string[], labels: string[], side: 'in' | 'out') => {
    const group = element('details', undefined, `flow-shared is-${side}`);
    group.dataset.flowShared = side;
    group.append(
      element(
        'summary',
        side === 'in' ? `經頁首／頁尾連進來 · ${ids.length}` : `頁首／頁尾可前往 · ${ids.length}`,
      ),
    );
    if (labels.length) group.append(element('p', `連結：${labels.join('、')}`, 'muted'));
    for (const other of ids) {
      const item = element('button', index.nodes.get(other)?.name || other, 'link-row');
      item.type = 'button';
      item.dataset.sharedScreen = other;
      item.onclick = () => options.open(other);
      item.onpointerenter = () => options.intent?.(other);
      group.append(item);
    }
    return group;
  };

  const shared = sharedNavigation(index, id);
  const incoming = gather(
    index,
    flowsOf(index)
      .filter((r) => r.to === id && r.from !== id)
      .map((r) => ({ other: r.from, triggers: r.triggers })),
  );
  const lines = focusLines(index, id),
    outgoing = gather(
      index,
      lines
        .filter((r) => !r.unresolved && r.to !== id)
        .map((r) => ({ other: r.to, triggers: r.triggers })),
    ),
    stays = lines.filter((r) => !r.unresolved && r.to === id).flatMap((r) => r.triggers),
    unknown = lines.filter((r) => r.unresolved).flatMap((r) => r.triggers);

  const rail = (side: 'in' | 'out') => {
    const count =
      side === 'in'
        ? incoming.length + shared.into.length
        : outgoing.length + shared.out.length + (stays.length ? 1 : 0) + (unknown.length ? 1 : 0);
    const title = side === 'in' ? '從哪裡來' : '會去哪裡';
    const box = element('section', undefined, `flow-rail is-${side}`);
    box.dataset.flowRail = side;
    box.setAttribute('aria-label', title);
    const state = options.rails(),
      open = state[side];
    box.dataset.open = String(open);
    const toggle = element('button', undefined, 'flow-rail-tab');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', `${open ? '收起' : '展開'}「${title}」（${count} 個）`);
    toggle.title = `${title} ${count}`;
    // Read in the direction of travel: in comes from the arrow, out leaves by it.
    const label = element('span', title, 'flow-rail-title'),
      number = element('span', String(count), 'flow-rail-count');
    if (side === 'in') toggle.append(icon('arrow'), label, number);
    else toggle.append(label, number, icon('arrow'));
    toggle.onclick = () => {
      options.onRails({ ...state, [side]: !open });
      update();
      root.querySelector<HTMLElement>(`[data-flow-rail="${side}"] button`)?.focus();
    };
    if (!open) {
      box.append(toggle);
      return box;
    }
    const head = element('div', undefined, 'flow-rail-head'),
      close = element('button', side === 'in' ? '收起 ‹' : '› 收起', 'flow-rail-close');
    close.type = 'button';
    close.setAttribute('aria-label', `收起「${title}」`);
    close.onclick = () => {
      options.onRails({ ...state, [side]: false });
      update();
      root.querySelector<HTMLElement>(`[data-flow-rail="${side}"] .flow-rail-tab`)?.focus();
    };
    const heading = element('h3', undefined);
    if (side === 'in') heading.append(icon('arrow'), element('span', `${title} · ${count}`));
    else heading.append(element('span', `${title} · ${count}`), icon('arrow'));
    head.append(close, heading);
    const body = element('div', undefined, 'flow-rail-body');
    if (side === 'in') {
      for (const card of incoming) body.append(screenCard(card, 'in'));
      if (shared.into.length) body.append(sharedGroup(shared.into, shared.intoLabels, 'in'));
      if (!count) {
        const start = element('p', '起點畫面：直接以網址進入', 'flow-empty');
        start.title = '畫面中找不到前往這裡的連結，可能由網址、書籤或其他系統直接進入。';
        body.append(start);
      }
    } else {
      for (const card of outgoing) body.append(screenCard(card, 'out'));
      if (stays.length) {
        const stay = element('div', undefined, 'flow-note');
        stay.dataset.flowStay = 'true';
        stay.append(element('strong', '留在本頁'));
        const how = via(id, stays);
        if (how) stay.append(element('span', how, 'flow-card-via'));
        const api = apiLine(index, stays, '呼叫');
        if (api) stay.append(api);
        body.append(stay);
      }
      if (unknown.length) {
        const note = element('div', undefined, 'flow-note is-unresolved');
        note.dataset.flowUnresolved = 'true';
        note.append(element('strong', '無法確定去向'));
        const how = via(id, unknown);
        note.append(
          element('span', how ? `${how} · 程式組成的網址` : '程式組成的網址', 'flow-card-via'),
        );
        note.title = text.unresolved;
        body.append(note);
      }
      if (shared.out.length) body.append(sharedGroup(shared.out, shared.outLabels, 'out'));
      if (!count) body.append(element('p', '這個畫面沒有前往其他畫面的連結或按鈕。', 'flow-empty'));
    }
    box.append(head, body);
    return box;
  };
  let before = rail('in'),
    after = rail('out');
  row.append(before, host, after);
  root.append(top, row);
  function update() {
    lit.length = 0;
    const left = rail('in'),
      right = rail('out');
    before.replaceWith(left);
    after.replaceWith(right);
    before = left;
    after = right;
  }
  return {
    element: root,
    host,
    top,
    update,
    counts: {
      in: incoming.length + shared.into.length,
      out: outgoing.length + shared.out.length + (stays.length ? 1 : 0) + (unknown.length ? 1 : 0),
    },
    light: (component) => {
      for (const { card, triggers } of lit)
        card.classList.toggle('is-lit', !!component && triggers.includes(component));
    },
  };
}
