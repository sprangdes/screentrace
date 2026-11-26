import { endpointMethod, endpointPath } from './endpoint-presentation';
import { Index } from './map';
import { Node } from './contracts';
import { element, text } from './text';
import { componentLabelsForScreen, kindName } from './labels';
import { callSources } from './usage';
import { methodBadge } from './api-page';
import { jsfLimitation } from './unsupported-framework';
import { apiEndpoints } from './api-page';
import { decisionSwitch, decisionLabel, noteEditor } from './review-ui';
import {
  ReviewState,
  Decision,
  DecisionNote,
  screenDecision,
  componentDecision,
  decisionNoteOf,
  markableComponents,
  fieldComponents,
  conflicts,
} from './shared/review';

/** The panel shows one of its lists at a time (ADR 0189). */
export type PanelTab = 'buttons' | 'fields' | 'apis';

/** Shows one tab's list and marks its tab, without rebuilding the panel. */
export function showPanelTab(panel: HTMLElement, tab: PanelTab): void {
  for (const section of panel.querySelectorAll<HTMLElement>('[data-tab-panel]'))
    section.hidden = section.dataset.tabPanel !== tab;
  for (const button of panel.querySelectorAll<HTMLElement>('[data-panel-tab]')) {
    const on = button.dataset.panelTab === tab;
    button.setAttribute('aria-selected', String(on));
    button.tabIndex = on ? 0 : -1;
  }
}

export interface ScreenPanelActions {
  /** Which list the panel shows; the caller keeps it so a rebuilt panel stays on it. */
  tab?: PanelTab;
  onTab?: (tab: PanelTab) => void;
  /** Set when the screen has no decision of its own and follows its feature's. */
  inherited?: { decision: Decision; feature: string };
  setScreen: (screenId: string, value: Decision) => void;
  setComponent: (screenId: string, componentId: string, value: Decision) => void;
  api: (endpointId: string) => void;
  buttonsOpen: boolean;
  onButtonsToggle: (open: boolean) => void;
  fieldsOpen?: boolean;
  onFieldsToggle?: (open: boolean) => void;
  /** Typing a note keeps it without rebuilding the panel; committing (leaving the field) may rebuild it. */
  setNote?: (screenId: string, componentId: string | undefined, note: DecisionNote) => void;
  commitNote?: () => void;
  /** Note editors left open, by `noteKey`, so a rebuilt panel keeps them open. */
  notesOpen?: Set<string>;
  highlight?: string;
  /** Where each button sits in the preview (top, then left); a button without a position is not visible there. */
  positions?: Map<string, { x: number; y: number }>;
  /** Pointing at a list row outlines its button in the preview; leaving clears it. */
  hover?: (componentId: string | undefined) => void;
  /** Choosing a list row scrolls the preview to its button and keeps it highlighted. */
  locate?: (componentId: string) => void;
}

// Buttons on roughly the same line (within this many pixels) read left to right.
const ROW_TOLERANCE = 8;

const endpointLabel = (node: Node) => {
  const method = endpointMethod(node);
  return `${method === 'ANY' ? '任何方法' : method} ${endpointPath(node)}`;
};

/** What a component leads to, phrased for people: the APIs it calls, then the screens it opens. */
function outcomes(index: Index, componentId: string, apis: Set<string>): string[] {
  const targets = [
    ...(index.graph.relationships || []).filter((e) => e.from === componentId).map((e) => e.to),
    ...(index.graph.behaviors || [])
      .filter((b) => b.triggerId === componentId && b.targetId)
      .map((b) => b.targetId!),
  ];
  const calls = new Set<string>(),
    opens = new Set<string>();
  for (const id of targets) {
    const node = index.nodes.get(id);
    if (node?.type === 'SCREEN') opens.add(`前往「${node.name}」`);
    else if (node && apis.has(node.id)) calls.add(endpointLabel(node));
  }
  return [[...calls].join(' · '), [...opens].join(' · ')].filter(Boolean);
}

/** Identifies one note editor across rebuilds of the panel. */
export const noteKey = (screenId: string, componentId?: string) =>
  JSON.stringify(componentId === undefined ? [screenId] : [screenId, componentId]);

/** Templates included by the screen; their buttons (page header／footer) are grouped separately. */
function fragmentFiles(index: Index, screenId: string): Set<string> {
  return new Set(
    (index.graph.relationships || [])
      .filter((e) => e.type === 'INCLUDES' && e.from === screenId)
      .map((e) => index.nodes.get(e.to))
      .filter(
        (n) => n && [n.type, n.attributes.kind, n.attributes.type].includes('TEMPLATE_FRAGMENT'),
      )
      .map((n) => n!.source?.file)
      .filter((f): f is string => !!f),
  );
}

export function screenPanel(
  panel: HTMLElement,
  index: Index,
  state: ReviewState,
  screenId: string,
  actions: ScreenPanelActions,
): void {
  const screen = index.nodes.get(screenId)!,
    routes = index.routes.get(screenId) || [],
    decision = screenDecision(state, screenId),
    // What the screen's buttons and fields follow: its own decision, or its feature's.
    effective = actions.inherited?.decision || decision,
    labels = componentLabelsForScreen(index, screenId);
  const apis = new Set(apiEndpoints(index).map((n) => n.id));
  const root = element('div', undefined, 'screen-panel');
  root.dataset.screenPanel = screenId;
  const header = element('section', undefined, 'panel-header');
  header.append(element('h2', screen.name));
  const url = element('code', routes[0] || text.noUrl, 'panel-url');
  url.title = routes.join('\n');
  header.append(url);
  if (routes.length > 1) {
    const more = element('details', undefined, 'panel-routes');
    more.append(element('summary', `其他網址 ${routes.length - 1} 個`));
    for (const route of routes.slice(1)) more.append(element('code', route));
    header.append(more);
  }
  header.append(
    decisionSwitch('這個畫面', decision, (value) => actions.setScreen(screenId, value), {
      screen: screenId,
      keys: true,
    }),
  );
  // Only the screen takes a note here; notes on buttons and fields come in from an md and are kept as they are.
  const notes = () => {
    const editor = noteEditor({
      label: '這個畫面',
      alwaysOpen: true,
      decision,
      note: decisionNoteOf(state, 'screen', screenId),
      open: true,
      onToggle: () => {},
      onInput: (note) => actions.setNote?.(screenId, undefined, note),
      onCommit: () => actions.commitNote?.(),
    });
    editor.dataset.noteFor = 'screen';
    return editor;
  };
  if (actions.inherited) {
    const tag = element(
      'p',
      `沒有個別標記，隨功能「${actions.inherited.feature}」${decisionLabel(actions.inherited.decision)}`,
      actions.inherited.decision === 'REMOVE' ? 'inherited-tag' : 'inherited-tag is-keep',
    );
    tag.dataset.screenInherited = actions.inherited.decision;
    header.append(tag);
  }
  if (actions.setNote) header.append(notes());
  if (screen.audience?.length) {
    const audience = element('details', undefined, 'panel-audience');
    audience.append(element('summary', '適用條件'));
    let displayed = screen.audience;
    try {
      const summary = JSON.parse(screen.attributes.audienceSummary || 'null');
      if (
        Array.isArray(summary) &&
        summary.every((a) => a && typeof a.text === 'string' && typeof a.truth === 'boolean')
      )
        displayed = summary;
    } catch {}
    for (const atom of displayed) {
      const item = element('p', atom.truth ? atom.text : `!(${atom.text})`);
      item.title = atom.source ? `${atom.source.file}:${atom.source.line}` : '';
      audience.append(item);
    }
    const raw = element('details');
    raw.append(element('summary', '原始完整條件'));
    let original = screen.audience;
    try {
      const value = JSON.parse(screen.attributes.audienceOriginal || 'null');
      if (
        Array.isArray(value) &&
        value.every((a) => a?.source && typeof a.text === 'string' && typeof a.truth === 'boolean')
      )
        original = value;
    } catch {}
    for (const atom of original)
      raw.append(
        element(
          'p',
          `${atom.truth ? atom.text : `!(${atom.text})`} (${atom.source.file}:${atom.source.line})`,
        ),
      );
    audience.append(raw);
    const groups = (index.graph.application.audiences || []).filter((group) =>
      screen.audience!.every((atom) =>
        group.some((fact) => fact.text === atom.text && fact.truth === atom.truth),
      ),
    );
    if (groups.length) {
      audience.append(element('p', `身分組合 ${groups.length} 種`));
      for (const group of groups)
        audience.append(
          element('p', group.map((a) => (a.truth ? a.text : `!(${a.text})`)).join(' && ')),
        );
    }
    header.append(audience);
  }
  root.append(header);

  const notices = element('section', undefined, 'panel-notices');
  if (screen.attributes.unsupportedComponentFramework === 'JSF') {
    const count = index.screens.filter(
        (s) => s.attributes.unsupportedComponentFramework === 'JSF',
      ).length,
      note = element('p', jsfLimitation(count), 'notice');
    note.dataset.jsfReminder = 'true';
    notices.append(note);
  }
  if (screen.attributes.missingStylePackages) {
    const names = screen.attributes.missingStylePackages.split('|').filter(Boolean).sort();
    if (names.length)
      notices.append(
        element('p', `此畫面的部分樣式來自未安裝的套件：${names.join('、')}`, 'notice'),
      );
  }
  for (const issue of conflicts(index.graph, state).filter(
    (c) => c.screenId === screenId || c.targetScreenId === screenId,
  )) {
    const note = element(
      'p',
      `「${index.nodes.get(issue.screenId)?.name || '畫面'}」保留的「${componentLabelsForScreen(index, issue.screenId).get(issue.componentId) || '按鈕'}」會前往已標記移除的「${index.nodes.get(issue.targetScreenId)?.name || '畫面'}」。`,
      'notice conflict',
    );
    note.dataset.conflict = `${issue.screenId}:${issue.componentId}`;
    notices.append(note);
  }
  if (notices.childElementCount) root.append(notices);

  const fieldIds = new Set(
      fieldComponents(index.graph)
        .filter((k) => k.screenId === screenId)
        .map((k) => k.componentId),
    ),
    markable = markableComponents(index.graph).filter((k) => k.screenId === screenId),
    keys = markable.filter((k) => !fieldIds.has(k.componentId)),
    fieldKeys = markable.filter((k) => fieldIds.has(k.componentId)),
    fragments = fragmentFiles(index, screenId);
  const buttons = element('details', undefined, 'panel-section panel-buttons');
  // Each list sits on its own tab and is always unfolded there.
  buttons.open = true;
  buttons.dataset.section = 'buttons';
  buttons.append(element('summary', `按鈕 ${keys.length} 個`));
  buttons.addEventListener('toggle', () => actions.onButtonsToggle(buttons.open));
  buttons.append(
    element(
      'p',
      keys.length
        ? '沒有個別標記的按鈕跟著畫面的決定。點一列可在預覽中標出。'
        : '這個畫面沒有可標記的按鈕',
      'panel-hint',
    ),
  );
  // What a row follows when it has no decision of its own, in words.
  const follows = (value: Decision) =>
    value === 'KEEP'
      ? '個別標記：保留'
      : value === 'REMOVE'
        ? '個別標記：移除'
        : effective === 'KEEP'
          ? '隨畫面保留'
          : effective === 'REMOVE'
            ? '隨畫面移除'
            : '隨畫面 · 未確認';
  const row = (componentId: string) => {
    const field = fieldIds.has(componentId),
      node = index.nodes.get(componentId),
      value = componentDecision(state, screenId, componentId),
      name = labels.get(componentId) || (field && node ? kindName(node) : '沒有文字的按鈕'),
      item = element('div', undefined, field ? 'button-row is-field' : 'button-row');
    item.dataset.componentRow = componentId;
    item.tabIndex = -1;
    if (actions.highlight === componentId) item.classList.add('is-highlighted');
    const info = element('button', undefined, 'button-info'),
      result = outcomes(index, componentId, apis);
    info.type = 'button';
    info.dataset.locate = componentId;
    const what = field ? '欄位' : '按鈕';
    info.title = actions.positions?.has(componentId)
      ? `在預覽中標示這個${what}`
      : `這個${what}在預覽中看不到`;
    item.onmouseenter = () => actions.hover?.(componentId);
    item.onmouseleave = () => actions.hover?.(undefined);
    info.onfocus = () => actions.hover?.(componentId);
    info.onblur = () => actions.hover?.(undefined);
    info.onclick = () => actions.locate?.(componentId);
    if (field) {
      // Fields are read here, not decided: a decision from an earlier md is still shown.
      item.dataset.field = 'true';
      info.append(
        element('strong', name),
        element('span', node ? kindName(node) : '欄位', 'button-effect is-kind'),
      );
      const pill = element(
        'span',
        value === 'UNDECIDED' ? '隨畫面' : follows(value),
        'field-follow',
      );
      pill.dataset.decision = value;
      item.append(info, pill);
      return item;
    }
    const status = element('span', follows(value), 'button-follow');
    if (value !== 'UNDECIDED') status.dataset.own = 'true';
    info.append(
      element('strong', name),
      element('span', result.length ? result.join(' → ') : '無法確定前往哪個畫面', 'button-effect'),
      status,
    );
    item.append(
      info,
      decisionSwitch(name, value, (next) => actions.setComponent(screenId, componentId, next), {
        compact: true,
        screen: screenId,
        component: componentId,
        follows: effective,
      }),
    );
    return item;
  };
  const positions = actions.positions,
    placed = (k: { componentId: string }) => !positions || positions.has(k.componentId);
  // Page order: top to bottom, then left to right, so the list reads like the preview.
  const byPosition = (a: { componentId: string }, b: { componentId: string }) => {
    const p = positions?.get(a.componentId),
      q = positions?.get(b.componentId);
    if (!p || !q) return 0;
    return Math.abs(p.y - q.y) > ROW_TOLERANCE ? p.y - q.y : p.x - q.x;
  };
  const own = keys.filter(
      (k) => !fragments.has(index.nodes.get(k.componentId)?.source?.file || ''),
    ),
    shared = keys.filter((k) => !own.includes(k));
  for (const key of own.filter(placed).sort(byPosition)) buttons.append(row(key.componentId));
  const group = (
    parent: HTMLElement,
    title: string,
    items: { componentId: string }[],
    note?: string,
  ) => {
    if (!items.length) return;
    const box = element('details', undefined, 'fragment-group');
    box.append(element('summary', `${title} ${items.length} 個`));
    if (note) box.append(element('p', note, 'muted'));
    for (const key of items) box.append(row(key.componentId));
    if (items.some((k) => k.componentId === actions.highlight)) box.open = true;
    parent.append(box);
  };
  group(buttons, '頁首、頁尾的按鈕', shared.filter(placed).sort(byPosition));
  group(
    buttons,
    '預覽中未顯示',
    [...own, ...shared].filter((k) => !placed(k)),
    '這些按鈕只在特定情況下出現（例如點了某個按鈕才開啟的視窗、載入中或錯誤狀態），預覽畫面中看不到它們的位置。',
  );
  root.append(buttons);

  // Input fields and tables: marked like buttons, listed in their own section in page order.
  if (fieldKeys.length) {
    const fields = element('details', undefined, 'panel-section panel-fields');
    fields.open = true;
    fields.dataset.section = 'fields';
    fields.append(element('summary', `欄位 ${fieldKeys.length} 個`));
    fields.addEventListener('toggle', () => actions.onFieldsToggle?.(fields.open));
    for (const key of fieldKeys.filter(placed).sort(byPosition))
      fields.append(row(key.componentId));
    group(
      fields,
      '預覽中未顯示',
      fieldKeys.filter((k) => !placed(k)),
      '這些欄位只在特定情況下出現，預覽畫面中看不到它們的位置。',
    );
    root.append(fields);
  }

  const sources = callSources(index.graph);
  const called = [...sources]
    .filter(([api, callers]) => apis.has(api) && callers.some((c) => c.screenId === screenId))
    .map(([api]) => index.nodes.get(api)!)
    .sort((a, b) => endpointLabel(a).localeCompare(endpointLabel(b), 'en'));
  const apiSection = element('section', undefined, 'panel-section panel-apis');
  apiSection.dataset.section = 'apis';
  if (!called.length) apiSection.append(element('p', '沒有已知的 API 呼叫', 'panel-hint'));
  // Each API with the method tag the API page uses, its path, and the buttons on this screen that call it.
  for (const node of called) {
    const link = element('button', undefined, 'api-row-link'),
      text = element('span', undefined, 'api-row-text'),
      by = [
        ...new Set(
          (sources.get(node.id) || [])
            .filter((c) => c.screenId === screenId && c.componentId)
            .map((c) => labels.get(c.componentId!))
            .filter((label): label is string => !!label),
        ),
      ];
    link.type = 'button';
    link.dataset.api = node.id;
    link.setAttribute('aria-label', endpointLabel(node));
    text.append(
      element('code', endpointPath(node), 'api-row-path'),
      element(
        'span',
        by.length
          ? `由「${by.slice(0, 3).join('」「')}」${by.length > 3 ? ' 等' : ''}觸發`
          : '畫面載入時呼叫',
        'api-row-via',
      ),
    );
    const arrow = element('span', '→', 'api-row-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    link.append(methodBadge(endpointMethod(node)), text, arrow);
    link.onclick = () => actions.api(node.id);
    apiSection.append(link);
  }
  root.append(apiSection);

  // One tab per list, in the order a review goes through them; the chosen one is shown.
  const tabs = element('div', undefined, 'panel-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '畫面內容');
  const lists: { tab: PanelTab; label: string; count: number; section: HTMLElement }[] = [
    { tab: 'buttons', label: '按鈕', count: keys.length, section: buttons },
  ];
  const fieldSection = root.querySelector<HTMLElement>('.panel-fields');
  if (fieldSection)
    lists.push({ tab: 'fields', label: '欄位', count: fieldKeys.length, section: fieldSection });
  lists.push({ tab: 'apis', label: 'API', count: called.length, section: apiSection });
  const chosen = lists.some((l) => l.tab === actions.tab) ? actions.tab! : 'buttons';
  for (const list of lists) {
    const button = element('button', undefined, 'panel-tab');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.dataset.panelTab = list.tab;
    button.append(
      element('span', list.label),
      element('span', String(list.count), 'panel-tab-count'),
    );
    button.onclick = () => {
      showPanelTab(root, list.tab);
      actions.onTab?.(list.tab);
    };
    button.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const at = lists.indexOf(list),
        next = lists[(at + (event.key === 'ArrowRight' ? 1 : -1) + lists.length) % lists.length];
      showPanelTab(root, next.tab);
      actions.onTab?.(next.tab);
      root.querySelector<HTMLElement>(`[data-panel-tab="${next.tab}"]`)?.focus();
    };
    list.section.dataset.tabPanel = list.tab;
    list.section.setAttribute('role', 'tabpanel');
    tabs.append(button);
  }
  buttons.before(tabs);
  showPanelTab(root, chosen);

  panel.replaceChildren(root);
}
