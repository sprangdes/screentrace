import { Index } from './map';
import { element, text } from './text';
import {
  PersonaView,
  reachLabel,
  reachHelp,
  reachSummary,
  personaDescription,
  factLabel,
  flowGroups,
  reachShares,
  reachCountsLabel,
} from './personas';
import { proportionBar, sharePercent } from './proportion';
import { splitter, SplitRange } from './splitter';

export interface PersonaOverlap {
  key: string;
  label: string;
  screens: string[];
}
/**
 * The screens this persona reaches, split by which other personas also reach them: its own screens first, then
 * screens shared with more personas before fewer, in persona order.
 */
export function personaOverlap(
  index: Index,
  views: PersonaView[],
  view: PersonaView,
): PersonaOverlap[] {
  const others = views.filter((other) => other !== view),
    order = new Map(views.map((v, i) => [v.persona.id, i]));
  const name = (id: string) => index.nodes.get(id)?.name || id;
  const groups = new Map<string, { with: PersonaView[]; screens: string[] }>();
  for (const screen of index.screens) {
    if (!view.depth.has(screen.id)) continue;
    const sharing = others.filter((other) => other.depth.has(screen.id)),
      key = sharing.map((other) => other.persona.id).join('+') || 'only';
    const group = groups.get(key) || groups.set(key, { with: sharing, screens: [] }).get(key)!;
    group.screens.push(screen.id);
  }
  const rank = (list: PersonaView[]) => list.map((v) => order.get(v.persona.id)!);
  const compare = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  };
  const byStep = (a: string, b: string) =>
    view.depth.get(a)! - view.depth.get(b)! ||
    name(a).localeCompare(name(b), 'zh-Hant') ||
    (a < b ? -1 : a > b ? 1 : 0);
  return [...groups]
    .sort(
      ([ka, a], [kb, b]) =>
        Number(kb === 'only') - Number(ka === 'only') ||
        b.with.length - a.with.length ||
        compare(rank(a.with), rank(b.with)),
    )
    .map(([key, group]) => ({
      key,
      label:
        key === 'only'
          ? '只有這個角色'
          : group.with.length === others.length
            ? '所有角色共用'
            : `和${group.with.map((v) => v.persona.name).join('、')}共用`,
      screens: group.screens.sort(byStep),
    }));
}

/** A group's share of the persona's screens as a bar length, rounded to a whole percent and never below 1. */
export const overlapPercent = sharePercent;

/**
 * The screens any persona reaches, for the coverage table: grouped by the first persona (in persona order) that
 * reaches them, then by that persona's step, then by name, so each persona's own screens sit together.
 */
export function coverageScreens(index: Index, views: PersonaView[]): string[] {
  const name = (id: string) => index.nodes.get(id)?.name || id,
    first = new Map<string, number>();
  for (const screen of index.screens) {
    const at = views.findIndex((view) => view.depth.has(screen.id));
    if (at >= 0) first.set(screen.id, at);
  }
  const step = (id: string) => views[first.get(id)!].depth.get(id)!;
  return [...first.keys()].sort(
    (a, b) =>
      first.get(a)! - first.get(b)! ||
      step(a) - step(b) ||
      name(a).localeCompare(name(b), 'zh-Hant') ||
      (a < b ? -1 : a > b ? 1 : 0),
  );
}

/** What the page keeps while the report is open: leaving for a screen and coming back finds the same view. */
const memory = {
  selected: undefined as string | undefined,
  all: false,
  split: undefined as number | undefined,
};
/** The side column's share of the layout: 28% at first, between 20% and 45%, and never narrower than 260px (CSS). */
export const PERSONA_SPLIT: SplitRange = { initial: 28, min: 20, max: 45 };

export interface PersonaPageOptions {
  selected?: string;
  onOpen: (screenId: string, personaId: string) => void;
  onPersona: (personaId: string) => void;
}

/**
 * The persona page: the personas as cards across the top; below, the chosen persona's flow as a board with one
 * column per step and its conditions and comparison beside it, or every persona against every screen.
 */
export function personaPage(
  index: Index,
  views: PersonaView[],
  options: PersonaPageOptions,
): HTMLElement {
  const byId = new Map(views.map((view) => [view.persona.id, view]));
  let selected = [options.selected, memory.selected, views[0]?.persona.id].find(
    (id) => !!id && byId.has(id),
  );
  const canCompare = views.length > 1 && views.some((view) => view.depth.size);
  let all = canCompare && memory.all;
  const root = element('section', undefined, 'persona-page'),
    top = element('div', undefined, 'persona-top'),
    detail = element('div', undefined, 'persona-detail');
  root.dataset.personaPage = 'true';
  detail.setAttribute('aria-label', '角色詳情');
  const title = element('h1', '角色');
  title.append(element('span', String(views.length), 'api-total'));
  const list = element('div', undefined, 'persona-cards');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', '角色清單');
  list.setAttribute('aria-orientation', 'horizontal');
  const compareAll = element('button', '全部角色對照', 'persona-compare-all');
  compareAll.type = 'button';
  compareAll.dataset.personaCompareAll = 'true';
  compareAll.title = '每個畫面哪些角色走得到';
  compareAll.onclick = () => {
    all = !all;
    memory.all = all;
    sync();
  };
  top.append(title, list);
  if (canCompare) top.append(compareAll);
  root.append(top, detail);
  const name = (id: string) => index.nodes.get(id)?.name || id;
  const route = (id: string) => index.routes.get(id)?.[0] || text.noUrl;

  /** Marks the chosen card (and the table button) and draws the view below. */
  const sync = (focus = false) => {
    for (const row of list.querySelectorAll<HTMLElement>('.persona-row')) {
      const on = row.dataset.personaRow === selected;
      row.setAttribute('aria-selected', String(on && !all));
      row.classList.toggle('is-current', on && !all);
      row.tabIndex = on ? 0 : -1;
      if (on && focus) row.focus();
    }
    compareAll.setAttribute('aria-pressed', String(all));
    if (all) renderAll();
    else renderDetail();
  };
  const select = (id: string, focus = false) => {
    selected = id;
    memory.selected = id;
    all = false;
    memory.all = false;
    sync(focus);
  };
  for (const view of views) {
    const row = element('button', undefined, 'api-row persona-row');
    row.type = 'button';
    row.setAttribute('role', 'option');
    row.dataset.personaRow = view.persona.id;
    const label = element('span', undefined, 'persona-row-text');
    label.append(
      element('strong', view.persona.name),
      element('span', personaDescription(view.persona), 'persona-row-about'),
      proportionBar(reachShares(view), reachCountsLabel(view), 'persona-reach-bar', true),
    );
    row.append(label, element('span', reachSummary(view), 'api-screen-count'));
    row.onclick = () => select(view.persona.id);
    list.append(row);
  }
  list.addEventListener('keydown', (event) => {
    const ids = views.map((v) => v.persona.id),
      at = ids.indexOf(selected || '');
    const next = event.key === 'ArrowDown' || event.key === 'ArrowRight',
      back = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
    const target = next
      ? ids[Math.min(ids.length - 1, at + 1)]
      : back
        ? ids[Math.max(0, at - 1)]
        : event.key === 'Home'
          ? ids[0]
          : event.key === 'End'
            ? ids.at(-1)
            : undefined;
    if (!target) return;
    event.preventDefault();
    select(target, true);
  });

  const section = (heading: string, key: string) => {
    const box = element('section', undefined, 'api-section');
    box.dataset.personaSection = key;
    box.append(element('h3', heading));
    return box;
  };
  /** A screen card on the board: its name opens it as this persona; a dashed card is one it may only possibly reach. */
  const card = (view: PersonaView, id: string) => {
    const reach = view.reach.get(id)!,
      button = element('button', undefined, 'persona-card');
    button.type = 'button';
    button.dataset.personaScreen = id;
    button.dataset.reach = reach;
    button.append(
      element('span', name(id), 'persona-card-name'),
      element('code', route(id), 'persona-card-route'),
    );
    if (reach === 'POSSIBLE') {
      const mark = element('span', reachLabel.POSSIBLE, 'persona-pill');
      mark.dataset.reach = reach;
      button.append(mark);
      button.title = reachHelp.POSSIBLE;
    }
    button.onclick = () => options.onOpen(id, view.persona.id);
    return button;
  };
  /** Screens as compact chips, for the comparison and the screens outside the flow. */
  const chips = (view: PersonaView, ids: string[]) => {
    const box = element('div', undefined, 'api-caller-list');
    for (const id of ids) {
      const chip = element('button', name(id), 'api-caller');
      chip.type = 'button';
      chip.dataset.personaScreen = id;
      chip.title = route(id);
      chip.onclick = () => options.onOpen(id, view.persona.id);
      box.append(chip);
    }
    return box;
  };
  const fold = (label: string, count: number, key: string, body: HTMLElement) => {
    const box = element('details', undefined, 'api-shared');
    box.dataset.personaFold = key;
    const summary = element('summary');
    summary.append(
      element('span', label, 'api-shared-name'),
      element('span', `${count} 個畫面`, 'muted'),
    );
    box.append(summary, body);
    return box;
  };

  /** Every reached screen against every persona: a dot per cell; a reached cell opens the screen as that persona. */
  const coverage = () => {
    const box = section('畫面 × 角色', 'coverage');
    box.classList.add('persona-coverage');
    box.append(
      element(
        'p',
        '每一列是一個畫面，每一欄是一個角色；點角色名稱看它的流程，點圓點以那個角色打開畫面。',
        'muted',
      ),
    );
    const legend = element('p', undefined, 'persona-coverage-legend');
    for (const reach of ['REACHABLE', 'POSSIBLE', 'UNREACHED'] as const) {
      const key = element(
        'span',
        reach === 'UNREACHED'
          ? `${reachLabel.UNREACHED}／${reachLabel.EXCLUDED}`
          : reachLabel[reach],
        'persona-coverage-key',
      );
      key.dataset.reach = reach;
      legend.append(key);
    }
    const table = element('table', undefined, 'persona-coverage-table'),
      head = element('tr');
    table.style.setProperty('--personas', String(views.length));
    head.append(element('th', undefined));
    for (const view of views) {
      const cell = element('th', undefined),
        button = element('button', view.persona.name, 'persona-coverage-persona');
      cell.scope = 'col';
      button.type = 'button';
      button.dataset.coveragePersona = view.persona.id;
      button.title = `看「${view.persona.name}」的流程`;
      button.onclick = () => select(view.persona.id);
      cell.append(button);
      head.append(cell);
    }
    const thead = element('thead');
    thead.append(head);
    const tbody = element('tbody');
    for (const id of coverageScreens(index, views)) {
      const row = element('tr'),
        label = element('th', name(id));
      row.dataset.coverageScreen = id;
      label.scope = 'row';
      label.title = route(id);
      row.append(label);
      for (const view of views) {
        const reach = view.reach.get(id)!,
          cell = element('td'),
          words = `${view.persona.name}：${reachLabel[reach]}`;
        cell.dataset.coveragePersona = view.persona.id;
        if (reach === 'REACHABLE' || reach === 'POSSIBLE') {
          const dot = element('button', undefined, 'persona-coverage-dot');
          dot.type = 'button';
          dot.dataset.reach = reach;
          dot.title = words;
          dot.setAttribute('aria-label', `${name(id)}，${words}`);
          dot.onclick = () => options.onOpen(id, view.persona.id);
          cell.append(dot);
        } else {
          const dot = element('span', undefined, 'persona-coverage-dot');
          dot.dataset.reach = reach;
          dot.title = words;
          dot.setAttribute('role', 'img');
          dot.setAttribute('aria-label', words);
          cell.append(dot);
        }
        row.append(cell);
      }
      tbody.append(row);
    }
    table.append(thead, tbody);
    box.append(legend, table);
    return box;
  };
  const renderAll = () => {
    detail.replaceChildren();
    const inner = element('div', undefined, 'persona-all');
    inner.dataset.personaAll = 'true';
    inner.append(coverage());
    detail.append(inner);
    detail.scrollTop = 0;
  };

  const renderDetail = () => {
    detail.replaceChildren();
    const view = selected ? byId.get(selected) : undefined;
    if (!view) {
      detail.append(element('p', '沒有角色', 'empty-list'));
      return;
    }
    const inner = element('div', undefined, 'persona-layout');
    inner.dataset.personaDetail = view.persona.id;
    const main = element('div', undefined, 'persona-main'),
      side = element('aside', undefined, 'persona-side');
    side.setAttribute('aria-label', '條件與比較');
    const heading = element('div', undefined, 'api-detail-title'),
      flow = element('button', '在畫布上看流程', 'persona-flow-button');
    flow.type = 'button';
    flow.dataset.personaFlow = view.persona.id;
    flow.onclick = () => options.onPersona(view.persona.id);
    heading.append(element('h2', view.persona.name, 'persona-detail-name'), flow);
    main.append(
      heading,
      element('p', `${personaDescription(view.persona)}。${reachSummary(view)}。`, 'api-reason'),
    );

    // The flow as a board: one column per step, each screen a card; a column's heading says how many screens it has.
    const groups = flowGroups(index, view),
      steps = groups.filter((g) => g.key.startsWith('step-'));
    const flowBox = section(`流程 ${view.depth.size} 個畫面`, 'flow');
    if (!steps.length)
      flowBox.append(
        element('p', '這個角色從起點走不到任何畫面；請確認設定中的起點網址與條件。', 'muted'),
      );
    if (view.unevaluated)
      flowBox.append(
        element(
          'p',
          `有 ${view.unevaluated} 個導覽的條件程式無法判定，經過它們的畫面以虛線框標為「${reachLabel.POSSIBLE}」。`,
          'muted',
        ),
      );
    if (steps.length) {
      const board = element('div', undefined, 'persona-board');
      board.setAttribute('role', 'list');
      board.setAttribute('aria-label', '依步數排列的畫面');
      for (const group of steps) {
        const column = element('div', undefined, 'persona-step-group');
        column.dataset.personaStep = group.key;
        column.setAttribute('role', 'listitem');
        column.append(
          element('h4', `${group.title} · ${group.screens.length}`, 'persona-step-title'),
        );
        for (const id of group.screens) column.append(card(view, id));
        board.append(column);
      }
      flowBox.append(board);
    }
    main.append(flowBox);

    const conditions = section('判定條件', 'conditions');
    for (const fact of view.persona.facts) {
      const chip = element('code', factLabel(fact), 'persona-fact');
      chip.dataset.truth = String(fact.truth);
      conditions.append(chip);
    }
    if (!view.persona.facts.length) conditions.append(element('p', '（沒有條件）', 'muted'));
    const starts = section('起點', 'starts');
    starts.append(
      element('code', (view.persona.startPaths || []).join('、') || '/', 'persona-fact'),
    );
    side.append(conditions, starts);
    if (views.length > 1 && view.depth.size) {
      const compare = section('和其他角色比較', 'compare');
      // Each group's bar is as long as its share of this persona's screens, so the groups compare at a glance.
      for (const overlap of personaOverlap(index, views, view)) {
        const box = fold(
          overlap.label,
          overlap.screens.length,
          overlap.key,
          chips(view, overlap.screens),
        );
        const bar = element('span', undefined, 'persona-overlap-bar'),
          fill = element('span', undefined, 'persona-overlap-fill');
        bar.setAttribute('aria-hidden', 'true');
        bar.dataset.overlap = overlap.key === 'only' ? 'only' : 'shared';
        fill.style.width = `${overlapPercent(overlap.screens.length, view.depth.size)}%`;
        bar.append(fill);
        box.querySelector('summary')!.insertBefore(bar, box.querySelector('summary .muted'));
        compare.append(box);
      }
      side.append(compare);
    }
    const outside = groups.filter((g) => g.reach === 'UNREACHED' || g.reach === 'EXCLUDED');
    if (outside.length) {
      const rest = section('流程以外', 'outside');
      for (const group of outside) {
        const box = fold(group.title, group.screens.length, group.key, chips(view, group.screens));
        box.title = reachHelp[group.reach];
        rest.append(box);
      }
      side.append(rest);
    }
    inner.append(
      main,
      splitter(inner, {
        label: '條件與比較欄寬度',
        side: 'end',
        range: PERSONA_SPLIT,
        value: memory.split ?? PERSONA_SPLIT.initial,
        onChange: (value) => {
          memory.split = value;
        },
      }),
      side,
    );
    detail.append(inner);
    detail.scrollTop = 0;
  };
  sync();
  return root;
}
