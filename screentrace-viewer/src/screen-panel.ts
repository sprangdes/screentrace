import { endpointMethod, endpointPath } from './endpoint-presentation';
import { Index } from './map';
import { Node } from './contracts';
import { element, text } from './text';
import { componentLabelsForScreen, kindName } from './labels';
import { callSources } from './usage';
import { methodBadge, pathCode } from './api-page';
import { jsfLimitation } from './unsupported-framework';
import { apiEndpoints } from './api-page';
import { sharedNavigation } from './relations';
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

export interface ScreenPanelActions {
  /** Set when the screen has no decision of its own and follows its feature's. */
  inherited?: { decision: Decision; feature: string };
  setScreen: (screenId: string, value: Decision) => void;
  setComponent: (screenId: string, componentId: string, value: Decision) => void;
  focus: (screenId: string) => void;
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

/** What a component leads to, phrased for people: destination screens and called APIs. */
function outcomes(index: Index, componentId: string, apis: Set<string>): string[] {
  const targets = [
    ...(index.graph.relationships || []).filter((e) => e.from === componentId).map((e) => e.to),
    ...(index.graph.behaviors || [])
      .filter((b) => b.triggerId === componentId && b.targetId)
      .map((b) => b.targetId!),
  ];
  const result = new Set<string>();
  for (const id of targets) {
    const node = index.nodes.get(id);
    if (node?.type === 'SCREEN') result.add(`前往「${node.name}」`);
    else if (node && apis.has(node.id)) result.add(endpointLabel(node));
  }
  return [...result];
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
    }),
  );
  const notes = (componentId?: string, label = '這個畫面') => {
    const key = noteKey(screenId, componentId),
      editor = noteEditor({
        label,
        compact: componentId !== undefined,
        decision:
          componentId === undefined ? decision : componentDecision(state, screenId, componentId),
        note:
          componentId === undefined
            ? decisionNoteOf(state, 'screen', screenId)
            : decisionNoteOf(state, 'component', screenId, componentId),
        open: !!actions.notesOpen?.has(key),
        onToggle: (open) => {
          if (open) actions.notesOpen?.add(key);
          else actions.notesOpen?.delete(key);
        },
        onInput: (note) => actions.setNote?.(screenId, componentId, note),
        onCommit: () => actions.commitNote?.(),
      });
    editor.dataset.noteFor = componentId === undefined ? 'screen' : 'component';
    if (componentId !== undefined) editor.dataset.componentId = componentId;
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
  buttons.open = actions.buttonsOpen;
  buttons.dataset.section = 'buttons';
  const decided = keys.filter(
    (k) => componentDecision(state, screenId, k.componentId) !== 'UNDECIDED',
  ).length;
  buttons.append(
    element('summary', `按鈕 ${keys.length} 個${decided ? ` · 已標記 ${decided}` : ''}`),
  );
  buttons.addEventListener('toggle', () => actions.onButtonsToggle(buttons.open));
  if (!keys.length) buttons.append(element('p', '這個畫面沒有可標記的按鈕', 'muted'));
  else
    buttons.append(
      element(
        'p',
        effective === 'REMOVE'
          ? '畫面已標記移除，未個別標記的按鈕隨畫面移除。'
          : '沒有個別標記的按鈕跟著畫面的決定。',
        'muted',
      ),
    );
  const row = (componentId: string) => {
    const field = fieldIds.has(componentId),
      node = index.nodes.get(componentId),
      value = componentDecision(state, screenId, componentId),
      name = labels.get(componentId) || (field && node ? kindName(node) : '沒有文字的按鈕'),
      item = element('div', undefined, 'button-row');
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
    if (field) item.dataset.field = 'true';
    info.append(
      element('strong', name),
      element(
        'span',
        field
          ? [node ? kindName(node) : '欄位', ...result].join(' · ')
          : result.length
            ? result.join(' · ')
            : '目的地無法確定',
        'muted',
      ),
    );
    item.onmouseenter = () => actions.hover?.(componentId);
    item.onmouseleave = () => actions.hover?.(undefined);
    info.onfocus = () => actions.hover?.(componentId);
    info.onblur = () => actions.hover?.(undefined);
    info.onclick = () => actions.locate?.(componentId);
    if (effective === 'REMOVE' && value === 'UNDECIDED')
      info.append(element('span', decisionLabel('INHERITED_REMOVE'), 'inherited-tag'));
    item.append(
      info,
      decisionSwitch(name, value, (next) => actions.setComponent(screenId, componentId, next), {
        compact: true,
        screen: screenId,
        component: componentId,
      }),
    );
    if (actions.setNote) item.append(notes(componentId, name));
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
    fields.open =
      !!actions.fieldsOpen || fieldKeys.some((k) => k.componentId === actions.highlight);
    fields.dataset.section = 'fields';
    const decidedFields = fieldKeys.filter(
      (k) => componentDecision(state, screenId, k.componentId) !== 'UNDECIDED',
    ).length;
    fields.append(
      element(
        'summary',
        `欄位 ${fieldKeys.length} 個${decidedFields ? ` · 已標記 ${decidedFields}` : ''}`,
      ),
      element(
        'p',
        effective === 'REMOVE'
          ? '畫面已標記移除，未個別標記的欄位隨畫面移除。'
          : '輸入欄位、顯示資料的欄位與表格；沒有個別標記的欄位跟著畫面的決定。',
        'muted',
      ),
    );
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

  const called = [...callSources(index.graph)]
    .filter(([api, callers]) => apis.has(api) && callers.some((c) => c.screenId === screenId))
    .map(([api]) => index.nodes.get(api)!)
    .sort((a, b) => endpointLabel(a).localeCompare(endpointLabel(b), 'en'));
  const apiSection = element('section', undefined, 'panel-section');
  apiSection.dataset.section = 'apis';
  apiSection.append(element('h3', `呼叫的 API ${called.length} 個`));
  if (!called.length) apiSection.append(element('p', '沒有已知的 API 呼叫', 'muted'));
  // Each API reads as on the API page: the same colored method tag, then the path with its parameters marked.
  for (const node of called) {
    const link = element('button', undefined, 'link-row api-link');
    link.dataset.api = node.id;
    link.setAttribute('aria-label', endpointLabel(node));
    link.append(methodBadge(endpointMethod(node)), pathCode(endpointPath(node), 'api-link-path'));
    link.onclick = () => actions.api(node.id);
    apiSection.append(link);
  }
  root.append(apiSection);

  const sources = [
    ...new Set(
      index.relations.filter((r) => r.to === screenId && r.from !== screenId).map((r) => r.from),
    ),
  ]
    .map((id) => index.nodes.get(id)!)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  const inbound = element('section', undefined, 'panel-section');
  inbound.dataset.section = 'inbound';
  inbound.append(element('h3', `從哪些畫面可來到這裡 ${sources.length} 個`));
  if (!sources.length)
    inbound.append(
      element('p', '畫面中找不到前往這裡的連結；可能由網址、書籤或其他系統直接進入。', 'muted'),
    );
  // Sources reached only through header/footer links are grouped, matching the single shared line on the preview.
  const navigation = sharedNavigation(index, screenId),
    viaShared = new Set(navigation.into);
  const sourceRow = (source: Node) => {
    const link = element('button', source.name, 'link-row');
    link.dataset.inbound = source.id;
    link.onclick = () => actions.focus(source.id);
    return link;
  };
  for (const source of sources) if (!viaShared.has(source.id)) inbound.append(sourceRow(source));
  if (viaShared.size) {
    const group = element('details', undefined, 'fragment-group inbound-shared'),
      summary = element('summary', `透過頁首／頁尾連結 ${viaShared.size} 個畫面`);
    group.append(summary);
    if (navigation.intoLabels.length)
      group.append(element('p', `連結：${navigation.intoLabels.join('、')}`, 'muted'));
    for (const source of sources) if (viaShared.has(source.id)) group.append(sourceRow(source));
    inbound.append(group);
  }
  root.append(inbound);
  panel.replaceChildren(root);
}
