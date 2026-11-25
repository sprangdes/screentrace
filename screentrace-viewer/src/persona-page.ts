import { Index } from './map';
import { element, text } from './text';
import { icon } from './shell-ui';
import {
  PersonaView,
  reachLabel,
  reachHelp,
  personaDescription,
  factLabel,
  flowGroups,
  reachShares,
  reachCountsLabel,
  roleTint,
} from './personas';
import { proportionBar } from './proportion';

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
};

export interface PersonaPageOptions {
  selected?: string;
  /** A screen's review decision, shown as the same corner mark as on the map. */
  status?: (screenId: string) => string;
  onOpen: (screenId: string, personaId: string) => void;
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
  // The comparison slides in beside the role's flow instead of replacing it.
  const body = element('div', undefined, 'persona-body'),
    drawer = element('aside', undefined, 'persona-drawer'),
    drawerHead = element('div', undefined, 'persona-drawer-head'),
    drawerBody = element('div', undefined, 'persona-drawer-body');
  drawer.setAttribute('aria-label', '全部角色對照');
  drawer.dataset.personaDrawer = 'true';
  // The 全部角色對照 button opens and closes it; the column has no close button of its own.
  drawerHead.append(element('h2', '全部角色對照'));
  drawer.append(drawerHead, drawerBody);
  body.append(detail, drawer);
  root.append(top, body);
  const name = (id: string) => index.nodes.get(id)?.name || id;
  const route = (id: string) => index.routes.get(id)?.[0] || text.noUrl;

  /** Marks the chosen card (and the table button) and draws the view below. */
  const sync = (focus = false) => {
    for (const row of list.querySelectorAll<HTMLElement>('.persona-row')) {
      const on = row.dataset.personaRow === selected;
      row.setAttribute('aria-selected', String(on));
      row.classList.toggle('is-current', on);
      row.tabIndex = on ? 0 : -1;
      if (on && focus) row.focus();
    }
    compareAll.setAttribute('aria-pressed', String(all));
    compareAll.setAttribute('aria-expanded', String(all));
    body.dataset.drawer = all ? 'open' : 'closed';
    drawer.inert = !all;
    if (all) renderAll();
    renderDetail();
  };
  const select = (id: string, focus = false) => {
    selected = id;
    memory.selected = id;
    sync(focus);
  };
  for (const view of views) {
    const row = element('button', undefined, 'api-row persona-row');
    row.type = 'button';
    row.setAttribute('role', 'option');
    row.dataset.personaRow = view.persona.id;
    row.dataset.roleTint = roleTint(index.graph, view.persona.id);
    const label = element('span', undefined, 'persona-row-text');
    const about = personaDescription(view.persona);
    label.append(element('strong', view.persona.name));
    if (about) label.append(element('span', about, 'persona-row-about'));
    // The card names the role; how far it gets is shown under its title below.
    row.append(label);
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
    const status = options.status?.(id);
    if (status === 'KEEP' || status === 'REMOVE') {
      button.dataset.screenStatus = status;
      const decided = icon(status === 'KEEP' ? 'check' : 'close');
      decided.classList.add('review-status-icon');
      decided.setAttribute('role', 'img');
      decided.setAttribute('aria-label', status === 'KEEP' ? text.keep : text.remove);
      button.append(decided);
    }
    if (reach === 'POSSIBLE') {
      const mark = element('span', reachLabel.POSSIBLE, 'persona-pill');
      mark.dataset.reach = reach;
      button.append(mark);
      button.title = reachHelp.POSSIBLE;
    }
    button.onclick = () => options.onOpen(id, view.persona.id);
    return button;
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
    for (const reach of ['REACHABLE', 'POSSIBLE'] as const) {
      const key = element('span', reachLabel[reach], 'persona-coverage-key');
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
        }
        // A role that does not reach the screen leaves its cell empty.
        row.append(cell);
      }
      tbody.append(row);
    }
    table.append(thead, tbody);
    box.append(legend, table);
    return box;
  };
  const renderAll = () => {
    const inner = element('div', undefined, 'persona-all');
    inner.dataset.personaAll = 'true';
    inner.append(coverage());
    drawerBody.replaceChildren(inner);
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
    inner.dataset.roleTint = roleTint(index.graph, view.persona.id);
    const main = element('div', undefined, 'persona-main');
    const heading = element('div', undefined, 'api-detail-title');
    heading.append(element('h2', view.persona.name, 'persona-detail-name'));
    // Under the role's name, an aligned summary: how far it gets, its conditions, where it starts.
    const facts = element('dl', undefined, 'persona-facts');
    const row = (label: string, ...value: (HTMLElement | string)[]) => {
      const dd = element('dd');
      dd.append(...value);
      facts.append(element('dt', label), dd);
    };
    const legend = element('span', undefined, 'persona-reach-legend');
    for (const reach of ['REACHABLE', 'POSSIBLE'] as const) {
      const key = element(
        'span',
        `${reachLabel[reach]} ${view.counts[reach]}`,
        'persona-reach-key',
      );
      key.dataset.reach = reach;
      legend.append(key);
    }
    row(
      '走到的畫面',
      legend,
      proportionBar(reachShares(view), reachCountsLabel(view), 'persona-reach-bar', true),
    );
    const conditions = view.persona.facts.map((fact) => {
      const chip = element('code', factLabel(fact), 'persona-fact');
      chip.dataset.truth = String(fact.truth);
      return chip;
    });
    row(
      '判定條件',
      ...(conditions.length ? conditions : [element('span', '（沒有條件）', 'muted')]),
    );
    row('起點', element('code', (view.persona.startPaths || []).join('、') || '/', 'persona-fact'));
    main.append(heading);
    if (personaDescription(view.persona))
      main.append(element('p', personaDescription(view.persona), 'api-reason'));
    main.append(facts);

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

    // The flow board takes the whole width (no side column).
    inner.append(main);
    detail.append(inner);
    detail.scrollTop = 0;
  };
  sync();
  return root;
}
