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
  rolePartition,
  SHARED_ROLE,
  NO_ROLE,
} from './personas';
import { proportionBar } from './proportion';
import { handoffs, stateCounts, unresolvedSources } from './role-handoffs';
import { componentLabelsForScreen } from './labels';

/** What the page keeps while the report is open: leaving for a screen and coming back finds the same view. */
const memory = {
  expanded: undefined as string | undefined,
};

/** A kept control that leads to a removed screen (`conflicts` in shared/review.ts). */
export interface PersonaPageConflict {
  screenId: string;
  componentId: string;
  targetScreenId: string;
}

export interface PersonaPageOptions {
  /** The role last opened; screens no role reaches open as this role. */
  selected?: string;
  /** A screen's effective review decision: 'KEEP', 'REMOVE' or anything else for not yet decided. */
  status?: (screenId: string) => string;
  onOpen: (screenId: string, personaId: string) => void;
  /** Kept controls leading to removed screens, listed under 需要你注意. */
  conflicts?: PersonaPageConflict[];
}

const HANDOFF_LIMIT = 8,
  UNREACHED_LIMIT = 40;

/**
 * The role overview: on the left what the review has settled and what needs a look; beside it every role as a row
 * of its flow, one column per step from its start URL; below, where the roles' flows meet as far as the source
 * proves it, and the screens no role reaches.
 */
export function personaPage(
  index: Index,
  views: PersonaView[],
  options: PersonaPageOptions,
): HTMLElement {
  const root = element('section', undefined, 'role-overview');
  root.dataset.personaPage = 'true';
  if (!views.length) {
    root.append(element('p', '沒有角色', 'empty-list'));
    return root;
  }
  const byId = new Map(views.map((view) => [view.persona.id, view]));
  const fallbackRole = [options.selected, views[0].persona.id].find((id) => !!id && byId.has(id))!;
  const name = (id: string) => index.nodes.get(id)?.name || id;
  const route = (id: string) => index.routes.get(id)?.[0] || text.noUrl;
  const status = (id: string) => {
    const value = options.status?.(id);
    return value === 'KEEP' || value === 'REMOVE' ? value : 'UNDECIDED';
  };
  /** The role a screen opens as when the item is not tied to one: the first whose flow reaches it. */
  const roleFor = (id: string) =>
    views.find((view) => view.depth.has(id))?.persona.id || fallbackRole;
  const partition = rolePartition(index);
  const roleOf = (id: string) => {
    if (partition) return partition.of.get(id) || NO_ROLE;
    const users = views.filter((view) => view.depth.has(id));
    return users.length > 1 ? SHARED_ROLE : users.length ? users[0].persona.id : NO_ROLE;
  };
  const states = stateCounts(index);
  const tint = (role: string) => roleTint(index.graph, role);

  const summary = element('aside', undefined, 'role-summary'),
    main = element('div', undefined, 'role-main');
  summary.setAttribute('aria-label', '摘要');
  main.setAttribute('aria-label', '角色流程');
  // The page scrolls below a band that leaves room for the layout switch floating at the top right.
  const body = element('div', undefined, 'role-overview-body');
  body.append(summary, main);
  root.append(element('div', undefined, 'role-overview-band'), body);

  // ---- Summary: what the review has settled ----
  const overviewCard = element('section', undefined, 'role-panel');
  overviewCard.append(
    element('h1', `${index.screens.length} 個畫面 · ${views.length} 個角色`, 'role-title'),
    element(
      'p',
      '每個角色從起點網址出發，往右是第 1、2、3 步。實線框＝一定會走到，虛線框＝途中有無法判定的條件。',
      'role-lead',
    ),
  );
  if (options.status) {
    const counts = { KEEP: 0, REMOVE: 0, UNDECIDED: 0 };
    for (const screen of index.screens) counts[status(screen.id)]++;
    const total = index.screens.length || 1,
      progress = element('div', undefined, 'role-progress'),
      head = element('div', undefined, 'role-progress-head'),
      bar = element('div', undefined, 'role-progress-bar');
    head.append(
      element('strong', '審查進度'),
      element('span', `${counts.KEEP + counts.REMOVE} / ${index.screens.length} 已確認`),
    );
    bar.setAttribute('role', 'img');
    bar.setAttribute(
      'aria-label',
      `${text.keep} ${counts.KEEP}、${text.remove} ${counts.REMOVE}、${text.undecided} ${counts.UNDECIDED}`,
    );
    for (const key of ['KEEP', 'REMOVE'] as const) {
      const part = element('span', undefined, 'role-progress-part');
      part.dataset.decision = key;
      part.style.width = `${(counts[key] / total) * 100}%`;
      bar.append(part);
    }
    const legend = element('div', undefined, 'role-progress-legend');
    for (const [key, label] of [
      ['KEEP', text.keep],
      ['REMOVE', text.remove],
      ['UNDECIDED', text.undecided],
    ] as const) {
      const item = element('span', `${label} ${counts[key]}`, 'role-progress-key');
      item.dataset.decision = key;
      legend.append(item);
    }
    progress.append(head, bar, legend);
    overviewCard.append(progress);
  }

  // ---- Summary: what needs a look ----
  const attention = element('section', undefined, 'role-panel');
  attention.append(element('h2', '需要你注意', 'role-panel-title'));
  const attentionItem = (
    kind: string,
    heading: string,
    detail: string,
    open: () => void,
  ): HTMLButtonElement => {
    const button = element('button', undefined, 'role-attention');
    button.type = 'button';
    button.dataset.attention = kind;
    const mark = element('span', undefined, 'role-attention-mark');
    mark.setAttribute('aria-hidden', 'true');
    if (kind === 'conflict') mark.append(icon('warning'));
    const words = element('span', undefined, 'role-attention-text');
    words.append(element('strong', heading), element('span', detail));
    button.append(mark, words);
    button.onclick = open;
    return button;
  };
  const items: HTMLElement[] = [];
  const conflictList = options.conflicts || [];
  if (conflictList.length) {
    const first = conflictList[0],
      label = componentLabelsForScreen(index, first.screenId).get(first.componentId);
    items.push(
      attentionItem(
        'conflict',
        `${conflictList.length} 個衝突`,
        label
          ? `「${name(first.screenId)}」保留的「${label}」會前往已移除的「${name(first.targetScreenId)}」`
          : `保留的「${name(first.screenId)}」會前往已移除的「${name(first.targetScreenId)}」`,
        () => options.onOpen(first.screenId, roleFor(first.screenId)),
      ),
    );
  }
  const unresolved = unresolvedSources(index),
    unresolvedScreens = index.screens.map((s) => s.id).filter((id) => unresolved.has(id));
  if (unresolvedScreens.length) {
    const first = unresolvedScreens[0],
      label = (unresolved.get(first) || [])
        .map((trigger) => componentLabelsForScreen(index, first).get(trigger) || '')
        .find(Boolean);
    items.push(
      attentionItem(
        'unresolved',
        `${unresolvedScreens.length} 個畫面無法確定去向`,
        label
          ? `${name(first)} ›「${label}」${text.unresolved}`
          : `「${name(first)}」${text.unresolved}`,
        () => options.onOpen(first, roleFor(first)),
      ),
    );
  }
  const possible = index.screens
    .map((s) => s.id)
    .filter((id) => views.some((view) => view.reach.get(id) === 'POSSIBLE'));
  if (possible.length) {
    const first = possible[0],
      view = views.find((v) => v.reach.get(first) === 'POSSIBLE')!;
    items.push(
      attentionItem(
        'possible',
        `${possible.length} 個${reachLabel.POSSIBLE}`,
        `「${name(first)}」對「${view.persona.name}」是${reachLabel.POSSIBLE}：${reachHelp.POSSIBLE}`,
        () => options.onOpen(first, view.persona.id),
      ),
    );
  }
  if (items.length) attention.append(...items);
  else attention.append(element('p', '目前沒有需要注意的地方', 'role-muted'));
  summary.append(
    overviewCard,
    attention,
    element(
      'p',
      '未被使用不等於可刪除：書籤、排程或其他系統直接呼叫的畫面，報表看不到。',
      'role-footnote',
    ),
  );

  // ---- The grid: one row per role, one column per step ----
  const steps = Math.max(1, ...views.map((view) => Math.max(0, ...view.depth.values())));
  const scroller = element('div', undefined, 'role-grid-scroll');
  scroller.setAttribute('role', 'region');
  scroller.setAttribute('aria-label', '各角色依步驟的畫面');
  scroller.tabIndex = 0;
  const grid = element('div', undefined, 'role-grid');
  grid.style.setProperty('--steps', String(steps));
  grid.append(element('div', '角色', 'role-grid-head'));
  for (let step = 1; step <= steps; step++)
    grid.append(element('div', `第 ${step} 步`, 'role-grid-head'));
  scroller.append(grid);
  const detail = element('section', undefined, 'role-detail');
  detail.id = 'role-detail';
  detail.setAttribute('aria-live', 'polite');
  const roleButtons: HTMLButtonElement[] = [];

  /** A screen in a role's row: opens it as that role. */
  const card = (view: PersonaView, id: string) => {
    const reach = view.reach.get(id)!,
      decision = status(id),
      button = element('button', undefined, 'role-card');
    button.type = 'button';
    button.dataset.personaScreen = id;
    button.dataset.reach = reach;
    button.dataset.screenStatus = decision;
    const head = element('span', undefined, 'role-card-head'),
      glyph = element('span', undefined, 'role-status');
    glyph.dataset.status = decision;
    glyph.setAttribute('role', 'img');
    glyph.setAttribute(
      'aria-label',
      decision === 'KEEP' ? text.keep : decision === 'REMOVE' ? text.remove : text.undecided,
    );
    if (decision !== 'UNDECIDED') glyph.append(icon(decision === 'KEEP' ? 'check' : 'close'));
    head.append(element('span', name(id), 'role-card-name'), glyph);
    button.append(head, element('code', route(id), 'role-card-route'));
    const notes: string[] = [];
    if (reach === 'POSSIBLE') notes.push(reachLabel.POSSIBLE);
    if ((states.get(id) || 0) >= 2) notes.push(`${states.get(id)} 種狀態`);
    if (notes.length) button.append(element('span', notes.join(' · '), 'role-card-note'));
    if (roleOf(id) === SHARED_ROLE) button.append(element('span', '共用畫面', 'role-card-shared'));
    button.title = `以「${view.persona.name}」打開「${name(id)}」${reach === 'POSSIBLE' ? `（${reachHelp.POSSIBLE}）` : ''}`;
    button.onclick = () => options.onOpen(id, view.persona.id);
    return button;
  };

  for (const view of views) {
    const roleTintKey = tint(view.persona.id),
      cell = element('div', undefined, 'role-grid-role'),
      button = element('button', undefined, 'role-name');
    cell.dataset.roleTint = roleTintKey;
    button.type = 'button';
    button.dataset.personaRow = view.persona.id;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detail.id);
    button.title = '顯示這個角色的判定條件與起點';
    button.append(
      element('strong', view.persona.name, 'role-name-text'),
      element(
        'span',
        `${reachLabel.REACHABLE} ${view.counts.REACHABLE} · 可能 ${view.counts.POSSIBLE}`,
        'role-name-counts',
      ),
    );
    const start = (view.persona.startPaths || []).join('、');
    if (start) {
      const line = element('span', '起點 ', 'role-name-start');
      line.append(element('code', start));
      button.append(line);
    }
    button.onclick = () => toggle(view.persona.id);
    roleButtons.push(button);
    cell.append(button);
    grid.append(cell);
    const byStep = new Map(
      flowGroups(index, view)
        .filter((group) => group.key.startsWith('step-'))
        .map((group) => [Number(group.key.slice(5)), group.screens]),
    );
    if (!byStep.size) {
      const empty = element(
        'div',
        '這個角色從起點走不到任何畫面；請確認設定中的起點網址與條件。',
        'role-grid-cell role-grid-empty',
      );
      empty.dataset.roleTint = roleTintKey;
      empty.style.gridColumn = `span ${steps}`;
      grid.append(empty);
      continue;
    }
    for (let step = 1; step <= steps; step++) {
      const cellBox = element('div', undefined, 'role-grid-cell');
      cellBox.dataset.roleTint = roleTintKey;
      cellBox.dataset.personaStep = `step-${step}`;
      const screens = byStep.get(step) || [];
      if (screens.length) {
        cellBox.setAttribute('role', 'list');
        cellBox.setAttribute('aria-label', `${view.persona.name} 第 ${step} 步`);
        for (const id of screens) {
          const item = card(view, id);
          item.setAttribute('role', 'listitem');
          cellBox.append(item);
        }
      }
      grid.append(cellBox);
    }
  }

  /** The chosen role's details under the grid: who it is, its conditions and where it starts. */
  const renderDetail = () => {
    const view = memory.expanded ? byId.get(memory.expanded) : undefined;
    for (const button of roleButtons)
      button.setAttribute('aria-expanded', String(button.dataset.personaRow === view?.persona.id));
    detail.replaceChildren();
    detail.hidden = !view;
    if (!view) return;
    detail.dataset.roleTint = tint(view.persona.id);
    detail.dataset.personaDetail = view.persona.id;
    const head = element('div', undefined, 'role-detail-head');
    head.append(element('h2', view.persona.name, 'role-detail-name'));
    const close = element('button', '收合', 'role-detail-close');
    close.type = 'button';
    close.onclick = () => toggle(view.persona.id, true);
    head.append(close);
    detail.append(head);
    if (personaDescription(view.persona))
      detail.append(element('p', personaDescription(view.persona), 'role-detail-about'));
    const facts = element('dl', undefined, 'role-detail-facts');
    const row = (label: string, ...value: (HTMLElement | string)[]) => {
      const dd = element('dd');
      dd.append(...value);
      facts.append(element('dt', label), dd);
    };
    const reached = element('span', undefined, 'role-detail-reach');
    reached.append(
      element('span', reachCountsLabel(view)),
      proportionBar(reachShares(view), reachCountsLabel(view), 'role-detail-bar', true),
    );
    row('走到的畫面', reached);
    const conditions = view.persona.facts.map((fact) => {
      const chip = element('code', factLabel(fact), 'role-fact');
      chip.dataset.truth = String(fact.truth);
      return chip;
    });
    row(
      '判定條件',
      ...(conditions.length ? conditions : [element('span', '（沒有條件）', 'role-muted')]),
    );
    row('起點', element('code', (view.persona.startPaths || []).join('、') || '/', 'role-fact'));
    detail.append(facts);
    if (view.unevaluated)
      detail.append(
        element(
          'p',
          `有 ${view.unevaluated} 個導覽的條件程式無法判定，經過它們的畫面以虛線框標為「${reachLabel.POSSIBLE}」。`,
          'role-muted',
        ),
      );
  };
  const toggle = (id: string, focus = false) => {
    memory.expanded = memory.expanded === id ? undefined : id;
    renderDetail();
    if (focus) roleButtons.find((b) => b.dataset.personaRow === id)?.focus();
  };
  if (memory.expanded && !byId.has(memory.expanded)) memory.expanded = undefined;
  renderDetail();

  // ---- Below the grid: where roles meet, and what no role reaches ----
  const lower = element('div', undefined, 'role-lower');
  const chip = (id: string, role: string) => {
    const button = element('button', name(id), 'role-chip');
    button.type = 'button';
    button.dataset.roleTint = tint(role);
    button.dataset.chipScreen = id;
    const view = byId.get(role);
    button.title = view ? `以「${view.persona.name}」打開「${name(id)}」` : `打開「${name(id)}」`;
    button.onclick = () => options.onOpen(id, view ? role : fallbackRole);
    return button;
  };
  const handoffCard = element('section', undefined, 'role-panel role-handoffs');
  handoffCard.dataset.roleHandoffs = 'true';
  handoffCard.append(element('h2', '跨角色的交接點', 'role-panel-title'));
  const found = handoffs(index, views);
  if (!found.length) handoffCard.append(element('p', '沒有原始碼可證明的交接點', 'role-muted'));
  else {
    handoffCard.append(
      element(
        'p',
        '只列原始碼能證明的關係：一個角色的畫面有連結或按鈕直接前往另一個角色才走得到的畫面，或兩個角色走到同一頁面的不同狀態。',
        'role-lead',
      ),
    );
    const list = element('ul', undefined, 'role-handoff-list');
    for (const item of found.slice(0, HANDOFF_LIMIT)) {
      const li = element('li', undefined, 'role-handoff');
      li.dataset.handoff = item.kind;
      const pair = element('span', undefined, 'role-handoff-pair'),
        arrow = element('span', item.kind === 'link' ? '→' : '↔', 'role-handoff-arrow');
      arrow.setAttribute('aria-hidden', 'true');
      pair.append(
        chip(item.from.screen, item.from.role),
        arrow,
        chip(item.to.screen, item.to.role),
      );
      const evidence =
        item.kind === 'state'
          ? '同一頁面的不同狀態'
          : item.labels.length
            ? `按${item.labels.map((label) => `「${label}」`).join('、')}前往`
            : '有連結前往';
      li.append(pair, element('span', evidence, 'role-handoff-evidence'));
      list.append(li);
    }
    handoffCard.append(list);
    if (found.length > HANDOFF_LIMIT)
      handoffCard.append(
        element('p', `還有 ${found.length - HANDOFF_LIMIT} 個交接點未列出`, 'role-muted'),
      );
  }
  const nobody = index.screens.map((s) => s.id).filter((id) => roleOf(id) === NO_ROLE);
  const unreachedCard = element('section', undefined, 'role-panel role-unreached');
  unreachedCard.dataset.roleUnreached = 'true';
  unreachedCard.append(
    element('h2', `任何角色都走不到 · ${nobody.length}`, 'role-panel-title'),
    element(
      'p',
      '只能用網址直接進入的畫面會列在這裡，通常是移除候選，但仍需確認是否有書籤或外部系統連入。',
      'role-lead',
    ),
  );
  if (nobody.length) {
    const chips = element('div', undefined, 'role-chips');
    for (const id of [...nobody]
      .sort((a, b) => name(a).localeCompare(name(b), 'zh-Hant') || (a < b ? -1 : 1))
      .slice(0, UNREACHED_LIMIT))
      chips.append(chip(id, NO_ROLE));
    unreachedCard.append(chips);
    if (nobody.length > UNREACHED_LIMIT)
      unreachedCard.append(
        element('p', `還有 ${nobody.length - UNREACHED_LIMIT} 個畫面未列出`, 'role-muted'),
      );
  }
  lower.append(handoffCard, unreachedCard);
  main.append(scroller, detail, lower);
  return root;
}
