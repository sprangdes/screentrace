import { projectSimulationData } from './simulation-data';
import { attachSimulation } from './simulation-ui';
import { setJourney } from './simulation';
import { applyJourney, resetJourney, restoreInputs, snapshotInputs } from './journey-data';
import { inertDocument } from './inert-document';
import { iconSprite, icon, iconButton } from './shell-ui';
import { initializeComponentLabels } from './labels';
import { screenNames, NameHint } from './names';
import { Payload, requireGraph, requirePreview } from './contracts';
import { element, text } from './text';
import { indexGraph, searchScreens } from './map';
import { canvas, fileTree, CanvasTransform, CanvasView } from './canvas';
import { prototypeViewer } from './prototype';
import { PrototypeHistory } from './prototype-history';
import { apiPage } from './api-page';
import { screenPanel, PanelTab, showPanelTab } from './screen-panel';
import { reviewStage, RailState, Stage } from './review-stage';
import { featureMap } from './feature-map';
import { features } from './shared/features';
import { placeBadge, decisionLabel, decisionSwitch } from './review-ui';
import { previewDocument, previewSelector } from './preview';
import { generateMarkdown, importMarkdown, markdownSizeWarning } from './shared/review-md';
import {
  autosaveSupported,
  chooseSaveFile,
  chooseOpenFile,
  isCancel,
  writeFile,
  handleStore,
  FileHandle,
} from './progress-file';
import { revealInPreview } from './reveal';
import {
  graphPersonas,
  personaView,
  flowGroups,
  factLabel,
  reachLabel,
  reachHelp,
  reachText,
  reachSummary,
  personaDescription,
  personaLayout,
  PersonaView,
  featuresByRole,
  rolePartition,
  roleTint,
} from './personas';
import { personaPage } from './persona-page';
import { suggestedPersonaNames, withSuggestedPersonaNames } from './shared/persona-names';
import { splitter, LIST_SPLIT } from './splitter';
import {
  loadReview,
  saveReview,
  componentDecision,
  screenDecision,
  effectiveComponent,
  setScreen,
  setComponent,
  setApi,
  setFeature,
  featureDecision,
  effectiveScreen,
  screenInherited,
  setDecisionNote,
  exportableNotes,
  statistics,
  conflicts,
  apiConflicts,
  ReviewState,
  Decision,
  DecisionNote,
} from './shared/review';

/** How long a message that something worked stays beside the save menu before it fades. */
const STATUS_SHOWN_MS = 5000;

type Filter = 'ALL' | 'UNDECIDED' | 'KEEP' | 'REMOVE';
const root = document.querySelector<HTMLDivElement>('#app')!;

/** Fields from earlier report versions (the component library mapping) that this report no longer uses.
 * Reasons and notes are used again (ADR 0155) and are kept. */
function withoutRetiredFields(state: ReviewState): { state: ReviewState; dropped: boolean } {
  const { component_overrides, orphan_component_overrides, manifest_sha256, ...rest } =
    state as ReviewState & Record<string, unknown>;
  const dropped =
    !!component_overrides || !!(orphan_component_overrides as unknown[] | undefined)?.length;
  return { state: rest as ReviewState, dropped };
}
/** Whether the state holds anything worth keeping: a keep／remove decision or a note. */
function hasMarks(state: ReviewState): boolean {
  const decided = (values: Record<string, Decision>) =>
    Object.values(values).some((d) => d !== 'UNDECIDED');
  const notes = exportableNotes(state);
  return (
    decided(state.screenDecisions) ||
    Object.values(state.componentDecisions).some(decided) ||
    decided(state.apiDecisions || {}) ||
    decided(state.featureDecisions || {}) ||
    Object.keys(notes.features).length > 0 ||
    Object.keys(notes.screens).length > 0 ||
    Object.keys(notes.components).length > 0 ||
    Object.keys(notes.apis).length > 0
  );
}

try {
  const payload = JSON.parse(document.querySelector('#st-data')!.textContent!) as Payload;
  requirePreview(payload.preview, requireGraph(payload.graph));
  const sourceGraph = requireGraph(payload.graph),
    sourceIndex = indexGraph(sourceGraph),
    documentsByScreen = new Map<string, Document>(),
    dynamicScreens = new Set<string>(),
    hints = new Map<string, NameHint>();
  for (const screen of sourceIndex.screens) {
    const parsed = inertDocument(payload.documents[screen.id] || '');
    documentsByScreen.set(screen.id, parsed);
    hints.set(screen.id, {
      title: parsed.querySelector('title')?.textContent || undefined,
      heading: parsed.querySelector('h1')?.textContent || undefined,
    });
    if (
      payload.preview.screens?.find((item) => item.graphScreenId === screen.id)?.dynamicExpressions
        ?.length
    )
      dynamicScreens.add(screen.id);
  }
  // Links that lead to a screen and the roles it is for name it in plain words (ADR 0163).
  const linkLabels = new Map<string, { label: string; from: string }[]>();
  for (const relation of sourceIndex.relations)
    if (relation.from !== relation.to)
      for (const trigger of relation.triggers) {
        const component = sourceIndex.nodes.get(trigger);
        if (
          component?.type !== 'COMPONENT' ||
          !['LINK', 'BUTTON'].includes(component.attributes.kind)
        )
          continue;
        linkLabels.set(relation.to, [
          ...(linkLabels.get(relation.to) || []),
          { label: component.name, from: relation.from },
        ]);
      }
  // Suggested roles named by the screen that creates their accounts (ADR 0178).
  const namedGraph = withSuggestedPersonaNames(
    sourceGraph,
    suggestedPersonaNames(sourceGraph, (id) => hints.get(id)?.heading),
  );
  const roles = new Map<string, string[]>();
  for (const persona of (namedGraph.application.personas || []) as {
    name?: string;
    screens?: Record<string, string>;
  }[])
    for (const [id, status] of Object.entries(persona.screens || {}))
      if (status === 'APPLIES' && persona.name)
        roles.set(id, [...(roles.get(id) || []), persona.name]);
  const displayNames = screenNames(sourceIndex.screens, hints, sourceIndex.routes, {
    linkLabels,
    roles,
  });
  const graph = {
      ...namedGraph,
      nodes: sourceGraph.nodes.map((node) =>
        node.type === 'SCREEN' ? { ...node, name: displayNames.get(node.id) || node.name } : node,
      ),
    },
    index = indexGraph(graph);
  initializeComponentLabels(
    index,
    documentsByScreen,
    dynamicScreens,
    payload.preview.elements || [],
  );
  const mdPayload: Payload = { ...payload, graph: namedGraph, componentLibrary: undefined };
  // Features by deterministic rules (ADR 0156); the same grouping the md and the review state use.
  const featureList = features(index),
    featureByScreen = new Map<string, (typeof featureList)[number]>();
  for (const feature of featureList)
    for (const id of feature.screens) featureByScreen.set(id, feature);
  const orderedScreens = [...index.screens].sort(
    (a, b) => a.name.localeCompare(b.name, 'zh-Hant') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  // Personas exist only when the analyst set them up; without them nothing about personas is shown.
  const personaViews = graphPersonas(graph).map((persona) => personaView(index, persona));

  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {}
  const restored = loadReview(storage, graph, payload.fingerprint),
    initial = withoutRetiredFields(restored.state);
  let reviewState = initial.state;

  // ---- view state
  let page: 'screens' | 'api' | 'personas' = 'screens',
    current: string | undefined,
    filter: Filter = 'ALL',
    listMode: 'list' | 'files' | 'features' = 'list',
    query = '',
    canvasTransform: CanvasTransform | undefined;
  let buttonsOpen = false,
    fieldsOpen = false,
    highlightComponent: string | undefined,
    selectedApi: string | undefined,
    personaId: string | undefined,
    showUnreached = false,
    panelTab: PanelTab = 'buttons',
    lastOverview: 'screens' | 'personas' = 'screens',
    lastReviewed: string | undefined;
  // The flow rails beside an open screen start folded; the person's choice holds while moving between screens.
  let rails: RailState = { in: false, out: false };
  // Note editors left open (screen panel keys and API IDs), so rebuilding a panel keeps them open.
  const notesOpen = new Set<string>(),
    apiNotesOpen = new Set<string>(),
    featureNotesOpen = new Set<string>(),
    featuresCollapsed = new Set<string>();
  /** A screen's own decision, or its feature's when it has none. */
  const screenState = (id: string) => effectiveScreen(graph, reviewState, id);
  const activePersona = (): PersonaView | undefined =>
    personaViews.find((view) => view.persona.id === personaId);
  const history = new PrototypeHistory();

  // ---- top bar
  const header = document.querySelector('header')!;
  header.classList.add('topbar');
  document.body.prepend(iconSprite());
  document.title = `${graph.application.name} · ScreenTrace`;
  document.querySelector('#application')!.textContent = graph.application.name;
  document.querySelector<HTMLElement>('#application')!.title = graph.application.name;
  const tabs = element('nav', undefined, 'page-tabs');
  tabs.setAttribute('aria-label', '主要分頁');
  // Three places to work (ADR 0189): the overview in its layouts, the review of one screen, and the APIs.
  const overviewTab = element('button', undefined, 'page-tab'),
    reviewTab = element('button', undefined, 'page-tab'),
    apiTab = element('button', undefined, 'page-tab');
  overviewTab.append(icon('screen'), element('span', '流程總覽'));
  reviewTab.append(icon('check'), element('span', '審查'));
  apiTab.append(icon('api'), element('span', 'API'));
  overviewTab.dataset.page = 'overview';
  reviewTab.dataset.page = 'review';
  apiTab.dataset.page = 'api';
  tabs.append(overviewTab, reviewTab, apiTab);
  const actions = element('div', undefined, 'topbar-actions');
  const progress = element('details', undefined, 'progress-menu'),
    progressSummary = element('summary', undefined, 'progress-button'),
    progressPanel = element('div', undefined, 'popover progress-panel');
  progressSummary.setAttribute('aria-label', '確認進度');
  progress.append(progressSummary, progressPanel);
  const saveStatus = element('span', undefined, 'save-status');
  saveStatus.setAttribute('role', 'status');
  const download = element('button', undefined, 'primary download-md');
  download.append(icon('import'), element('span', '交付 md'));
  download.dataset.mdExport = 'true';
  // A dot on the button while there are marks that are neither in a progress file nor in a downloaded md.
  const unsavedDot = element('span', undefined, 'unsaved-dot');
  unsavedDot.setAttribute('aria-hidden', 'true');
  download.append(unsavedDot);
  const openMd = element('button', '開啟 md…', 'menu-row');
  openMd.dataset.mdImport = 'true';
  const saveMenu = element('details', undefined, 'save-menu'),
    saveSummary = element('summary', undefined, 'file-state'),
    savePanel = element('div', undefined, 'popover save-panel');
  saveSummary.setAttribute('aria-label', '進度檔');
  saveMenu.append(saveSummary, savePanel);
  const fileInput = element('input');
  fileInput.type = 'file';
  fileInput.accept = '.md,text/markdown,text/plain';
  fileInput.hidden = true;
  fileInput.setAttribute('aria-label', '開啟 md');
  const help = element('details', undefined, 'help-menu'),
    helpSummary = element('summary', undefined, 'icon-button');
  helpSummary.setAttribute('aria-label', '說明');
  helpSummary.title = '說明';
  helpSummary.append(icon('question'));
  const helpPanel = element('div', undefined, 'popover help-panel');
  helpPanel.append(element('h2', '操作說明'));
  const helpList = (title: string, items: string[]) => {
    helpPanel.append(element('h3', title));
    const list = element('ul');
    for (const item of items) list.append(element('li', item));
    helpPanel.append(list);
  };
  helpList('快捷鍵', [
    'k 保留、x 移除、u 未確認（作用於目前畫面，或右側欄中選取的按鈕、欄位）',
    'n 前往下一個未確認的畫面',
    '/ 搜尋畫面',
    'f 全螢幕預覽（展示用，再按一次或 Esc 結束）',
    'Esc 返回總覽',
  ]);
  helpList('操作方式', [
    '觸控板兩指滑動或滑鼠拖曳移動畫布；兩指捏合或 ⌘／Ctrl＋滾輪縮放',
    '點一下畫面看它的關聯，點兩下查看完整預覽',
    '在預覽中點連結或按鈕，會模擬前往的畫面；點輸入欄位或表格，右側欄會標出對應的欄位',
    '右側欄的「備註」可寫下修改意見或移除理由，會寫進 md 交給 AI',
    'API 頁可直接標記 API；與畫面標記推導的狀態不一致時列為衝突',
    '標記會自動暫存在這個瀏覽器，但換電腦或清除瀏覽資料就會遺失；請用「交付 md」保存並交給 AI',
  ]);
  helpList('狀態', [
    '綠色勾：保留',
    '紅色叉：移除',
    '虛線圓：未確認（按鈕列的 ↺ 表示跟隨畫面）',
    '隨畫面移除：畫面標記移除時，沒有個別標記的按鈕與欄位一起移除',
  ]);
  helpList('ScreenTrace 看不到的事', [
    '書籤或 Email 連結直接進入的畫面',
    '排程、批次工作或其他系統直接呼叫的 API',
    '比對不到已知網址格式的程式組成連結',
  ]);
  help.append(helpSummary, helpPanel);
  actions.append(progress, saveMenu, saveStatus, download, fileInput, help);
  header.append(tabs, actions);
  for (const menu of [progress, help, saveMenu])
    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menu.open) {
        event.stopPropagation();
        menu.open = false;
        menu.querySelector('summary')!.focus();
      }
    });
  document.addEventListener('click', (event) => {
    for (const menu of [progress, help, saveMenu])
      if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
  });

  // ---- shell
  const shell = element('div', undefined, 'shell'),
    nav = element('nav', undefined, 'sidebar'),
    main = element('main'),
    panel = element('aside', undefined, 'details-panel');
  nav.setAttribute('aria-label', '畫面清單');
  panel.setAttribute('aria-label', '畫面資訊');
  const searchBox = element('div', undefined, 'search-box'),
    search = element('input'),
    clearSearch = iconButton('清除搜尋', 'close');
  search.type = 'search';
  search.placeholder = '搜尋 URL 或畫面名稱';
  search.setAttribute('aria-label', '搜尋 URL 或畫面名稱');
  const slashKey = element('kbd', '/');
  slashKey.setAttribute('aria-hidden', 'true');
  slashKey.title = '按 / 搜尋';
  searchBox.append(icon('search'), search, clearSearch, slashKey);
  const modes = element('div', undefined, 'segmented'),
    listButton = element('button', '清單'),
    filesButton = element('button', '檔案結構'),
    featuresButton = element('button', '功能');
  featuresButton.dataset.listMode = 'features';
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', '清單顯示方式');
  modes.append(listButton, filesButton, featuresButton);
  // The status filter sits in plain sight under the search box, each choice with its count (ADR 0189).
  const searchRow = element('div', undefined, 'search-row'),
    chips = element('div', undefined, 'filter-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', '依狀態篩選');
  searchRow.append(searchBox);
  const notices = element('div', undefined, 'sidebar-notices'),
    list = element('div', undefined, 'screen-list');
  // The persona bar sits on the map: one button per persona turns the map into that persona's flow, step by step.
  const personaBar = element('section', undefined, 'persona-bar'),
    personaSwitch = element('div', undefined, 'persona-switch'),
    personaInfo = element('div', undefined, 'persona-info');
  personaBar.dataset.personaBar = 'true';
  personaBar.setAttribute('aria-label', '角色流程');
  personaSwitch.setAttribute('role', 'group');
  personaSwitch.setAttribute('aria-label', '依角色顯示流程');
  personaBar.append(personaSwitch, personaInfo);
  // The buttons and the checkbox stay mounted, so keyboard focus survives a switch; only their state and the text change.
  const personaButtons = [
    { id: '', name: '不套用角色' },
    ...personaViews.map((view) => ({ id: view.persona.id, name: view.persona.name })),
  ].map((option) => {
    const button = element('button', option.name);
    button.dataset.personaOption = option.id;
    if (option.id) button.dataset.roleTint = roleTint(graph, option.id);
    button.onclick = () => {
      if ((personaId || '') === option.id) return;
      personaId = option.id || undefined;
      showUnreached = false;
      render();
    };
    personaSwitch.append(button);
    return button;
  });
  const personaWho = element('p', undefined, 'persona-who'),
    personaKeys = element('span', undefined, 'persona-keys'),
    personaLegend = element('div', undefined, 'persona-legend'),
    personaNote = element('p', undefined, 'persona-note');
  const showAll = element('label', undefined, 'persona-toggle'),
    showAllBox = element('input'),
    showAllText = element('span');
  showAllBox.type = 'checkbox';
  showAllBox.dataset.personaShowAll = 'true';
  showAllBox.onchange = () => {
    showUnreached = showAllBox.checked;
    render();
  };
  showAll.append(showAllBox, showAllText);
  // A role's map shows its own flow only; screens it does not reach are not offered (ADR 0188).
  showAll.hidden = true;
  personaLegend.append(personaKeys);
  personaInfo.append(personaWho, personaLegend, personaNote);
  const renderPersonaBar = () => {
    for (const button of personaButtons)
      button.setAttribute(
        'aria-pressed',
        String((personaId || '') === button.dataset.personaOption),
      );
    const persona = activePersona();
    personaInfo.hidden = !persona;
    if (!persona) return;
    personaWho.dataset.personaDescription = persona.persona.id;
    const about = personaDescription(persona.persona);
    personaWho.replaceChildren(element('strong', persona.persona.name));
    if (about) personaWho.append(element('span', about));
    personaKeys.replaceChildren(
      ...(['REACHABLE', 'POSSIBLE'] as const).map((reach) => {
        const key = element('span', `${reachLabel[reach]} ${persona.counts[reach]}`, 'persona-key');
        key.dataset.reach = reach;
        key.title = reachHelp[reach];
        return key;
      }),
    );
    personaNote.textContent = !persona.depth.size
      ? '這個角色從起點走不到任何畫面；請確認設定中的起點網址與條件。'
      : persona.unevaluated
        ? `有 ${persona.unevaluated} 個導覽的條件程式無法判定，經過它們的畫面列為「可能走到」。`
        : '';
    personaNote.hidden = !personaNote.textContent;
  };
  // The same sidebar toggle sits in the same top-left spot whether the list is open or folded into the rail.
  const sidebarHeader = element('div', undefined, 'sidebar-header'),
    collapseList = iconButton('收起畫面清單', 'sidebar');
  sidebarHeader.append(collapseList, element('h2', '畫面清單'));
  const rail = element('div', undefined, 'sidebar-rail'),
    expandList = iconButton('展開畫面清單', 'sidebar'),
    railSearch = iconButton('搜尋畫面', 'search');
  expandList.classList.add('rail-toggle');
  const railCount = element('span', undefined, 'rail-count'),
    railNext = element('button', undefined, 'rail-next');
  railNext.type = 'button';
  railNext.setAttribute('aria-label', '下一個未確認');
  railNext.title = '下一個未確認（n）';
  railNext.append(element('kbd', 'n'));
  rail.append(expandList, railSearch, railCount, railNext);
  const sidebarBody = element('div', undefined, 'sidebar-body');
  // The way through the review: the next screen nobody has decided on, always at the foot of the list.
  const nextButton = element('button', undefined, 'next-undecided');
  nextButton.type = 'button';
  nextButton.dataset.nextUndecided = 'true';
  nextButton.append(element('span', '下一個未確認'), element('kbd', 'n'));
  sidebarBody.append(sidebarHeader, searchRow, chips, modes, notices, list, nextButton);
  nav.append(
    rail,
    sidebarBody,
    splitter(shell, {
      label: '畫面清單寬度',
      side: 'start',
      range: LIST_SPLIT,
      value: LIST_SPLIT.initial,
      property: '--list-split',
      unit: '',
      onChange: () => {},
    }),
  );
  // The screen details appear only while a screen is open; they fold into a rail on their own edge, mirroring the list.
  const panelBody = element('div', undefined, 'details-body'),
    collapseDetails = iconButton('收起畫面資訊', 'sidebarRight'),
    detailsRail = element('div', undefined, 'details-rail'),
    expandDetails = iconButton('展開畫面資訊', 'sidebarRight');
  collapseDetails.classList.add('details-toggle');
  expandDetails.classList.add('rail-toggle');
  const railDecide = element('div', undefined, 'rail-decide');
  detailsRail.append(expandDetails, railDecide);
  panel.append(collapseDetails, detailsRail, panelBody);
  shell.append(nav, main, panel);
  if (restored.warning && !restored.warning.includes('覆寫'))
    notices.append(element('p', restored.warning, 'notice'));
  if (initial.dropped)
    notices.append(
      element(
        'p',
        '先前的進度含已不再使用的欄位（元件庫對應），已略過；保留／移除標記與備註不受影響。',
        'notice',
      ),
    );

  const visibleScreens = (): Set<string> | undefined =>
    filter === 'ALL'
      ? undefined
      : new Set(index.screens.filter((s) => screenState(s.id) === filter).map((s) => s.id));
  // A message that something worked fades after a few seconds; a failure stays until the next message.
  let sayTimer: number | undefined;
  const say = (message: string, state: 'saved' | 'error' = 'saved') => {
    window.clearTimeout(sayTimer);
    saveStatus.classList.remove('is-fading');
    saveStatus.textContent = message;
    saveStatus.dataset.state = state;
    if (state === 'saved')
      sayTimer = window.setTimeout(() => {
        saveStatus.classList.add('is-fading');
        sayTimer = window.setTimeout(() => {
          saveStatus.textContent = '';
          saveStatus.classList.remove('is-fading');
        }, 400);
      }, STATUS_SHOWN_MS);
  };
  // Counts every change to the decisions, so a remembered file opened later can tell
  // whether the person decided something in the meantime.
  let edits = 0;
  const persist = () => {
    edits++;
    if (saveReview(storage, reviewState)) say('⚠ 無法暫存在瀏覽器，請用「交付 md」保存', 'error');
  };
  // ---- keeping the marks: when the md was last downloaded, and whether marks exist that no file holds
  const exportKey = `screentrace:last-export:v1:${encodeURIComponent(graph.application.name)}:${payload.fingerprint}`;
  /** A short fingerprint of the marks, to tell on the next visit whether the last download still holds them. */
  const marksHash = (state: ReviewState) => {
    let hash = 0x811c9dc5;
    const text = JSON.stringify([
      state.screenDecisions,
      state.componentDecisions,
      state.apiDecisions || {},
      state.featureDecisions || {},
      exportableNotes(state),
    ]);
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
    return (hash >>> 0).toString(16);
  };
  // -1: the marks restored from this browser are not known to be in any file.
  let exportedEdits = -1,
    lastExport: Date | undefined,
    reminded = false;
  try {
    const saved = JSON.parse(storage?.getItem(exportKey) || 'null');
    if (saved && typeof saved.at === 'string' && Number.isFinite(Date.parse(saved.at))) {
      lastExport = new Date(saved.at);
      if (saved.marks === marksHash(reviewState)) exportedEdits = 0;
    }
  } catch {
    /* the time is only a convenience */
  }
  const exportTime = (date: Date) =>
    date.toLocaleString('zh-TW', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const applyImported = (imported: Awaited<ReturnType<typeof importMarkdown>>) => {
    const clean = withoutRetiredFields(imported.state);
    reviewState = clean.state;
    persist();
    // What was just opened is a file the person has; until the next mark there is nothing unsaved.
    exportedEdits = edits;
    notices.querySelectorAll('[data-import-notice]').forEach((n) => n.remove());
    // A different analysis only matters when the file holds decisions that could now point elsewhere.
    const decided = hasMarks(clean.state);
    const messages = [
      imported.changed && decided ? '分析結果已變更，部分標記可能對應不到目前的畫面。' : '',
      imported.orphans.length
        ? `有 ${imported.orphans.length} 筆標記找不到對應的畫面、按鈕、API 或功能，已保留在檔案中。`
        : '',
      clean.dropped ? '檔案含已不再使用的欄位（元件庫對應），已略過。' : '',
    ].filter(Boolean);
    for (const message of messages) {
      const note = element('p', message, 'notice');
      note.dataset.importNotice = 'true';
      notices.append(note);
    }
    const first = notices.querySelector<HTMLElement>('p[data-import-notice]');
    if (first) {
      const dismiss = element('button', '知道了', 'notice-dismiss');
      dismiss.type = 'button';
      dismiss.onclick = () =>
        notices.querySelectorAll('[data-import-notice]').forEach((n) => n.remove());
      first.append(dismiss);
    }
    if (imported.orphans.length) {
      const list = element('ul', undefined, 'notice orphan-list');
      list.dataset.importNotice = 'true';
      list.dataset.mdOrphans = 'true';
      for (const orphan of imported.orphans)
        list.append(
          element(
            'li',
            `${orphan.featureKey !== undefined ? `功能 ${orphan.featureKey}` : orphan.apiId !== undefined ? `API ${orphan.apiId}` : orphan.screenId}${orphan.componentId ? ` / ${orphan.componentId}` : ''}${orphan.reason ? `：${orphan.reason}` : ''}`,
          ),
        );
      notices.append(list);
    }
  };
  // ---- progress file: the md the person chose, rewritten after every decision (Chrome／Edge)
  type FileState = 'unsupported' | 'none' | 'pending' | 'saving' | 'saved' | 'error';
  const fileKey = graph.application.name,
    suggestedName = `screentrace-review-${fileKey.replace(/[\\/:*?"<>|\s]+/g, '-')}.md`;
  let fileHandle: FileHandle | undefined,
    fileState: FileState = autosaveSupported() ? 'none' : 'unsupported',
    fileError = '',
    promptDismissed = false,
    writeTimer: ReturnType<typeof setTimeout> | undefined,
    writing: Promise<void> = Promise.resolve();
  const fileLabels: Record<FileState, string> = {
    unsupported: '未自動存檔',
    none: '尚未設定進度檔',
    pending: '繼續上次進度',
    saving: '儲存中…',
    saved: '已自動儲存',
    error: '儲存失敗',
  };
  /** Marks exist that are neither written to a progress file nor in an md downloaded since the last change. */
  const unsaved = () =>
    edits !== exportedEdits &&
    !(fileHandle && (fileState === 'saved' || fileState === 'saving')) &&
    hasMarks(reviewState);
  const renderExport = () => {
    const pending = unsaved();
    download.dataset.unsaved = String(pending);
    download.title = [
      pending ? '有尚未保存到檔案的標記' : '',
      lastExport ? `上次交付 md：${exportTime(lastExport)}` : '尚未交付過 md',
    ]
      .filter(Boolean)
      .join('\n');
  };
  const lastExportLine = () =>
    element(
      'p',
      lastExport ? `上次交付 md：${exportTime(lastExport)}` : '這份報表尚未交付過 md。',
      'muted last-export',
    );
  const menuButton = (label: string, action: () => void, primary = false) => {
    const button = element('button', label, primary ? 'menu-row primary' : 'menu-row');
    button.onclick = () => {
      saveMenu.open = false;
      action();
    };
    return button;
  };
  const renderFile = () => {
    renderExport();
    saveMenu.dataset.fileState = fileState;
    const dot = element('span', undefined, 'file-dot');
    saveSummary.replaceChildren(dot, element('span', fileLabels[fileState]), icon('more'));
    saveSummary.title = fileHandle
      ? `${fileLabels[fileState]}：${fileHandle.name}`
      : fileLabels[fileState];
    savePanel.replaceChildren(element('h2', '進度檔'));
    const text = (value: string) => savePanel.append(element('p', value, 'muted'));
    if (fileState === 'unsupported') {
      text(
        '這個瀏覽器不支援自動存檔。標記只暫存在這個瀏覽器，換電腦或清除瀏覽資料就會遺失；請用「交付 md」保存，之後用「開啟 md」接續。',
      );
      savePanel.append(
        lastExportLine(),
        menuButton('交付 md', () => download.click(), true),
        openMd,
      );
      return;
    }
    if (fileState === 'none') {
      text('選擇一個 md 檔的存放位置，之後每次標記都會自動寫入。這個檔案就是要交給 AI 的 md。');
      savePanel.append(
        menuButton('選擇存放位置…', () => void choose(), true),
        menuButton('交付 md', () => download.click()),
        openMd,
        lastExportLine(),
      );
      if (!promptDismissed)
        savePanel.append(
          menuButton('稍後再說', () => {
            promptDismissed = true;
          }),
        );
      return;
    }
    const name = fileHandle?.name || '';
    if (fileState === 'pending') {
      text(`上次的進度檔：${name}。載入後以進度檔的內容為準。`);
      savePanel.append(
        menuButton(`繼續上次進度：${name}`, () => void resume(), true),
        openMd,
        menuButton('選擇新的存放位置…', () => void choose()),
      );
      return;
    }
    if (fileState === 'error') {
      text(`寫入 ${name} 失敗：${fileError}。標記仍保留在這個頁面。`);
      savePanel.append(
        menuButton(
          '重試',
          () => {
            writing = writing.then(writeNow);
          },
          true,
        ),
        menuButton('選擇新的存放位置…', () => void choose()),
      );
      return;
    }
    text(`每次標記都會自動寫入 ${name}。`);
    savePanel.append(
      menuButton('更換存放位置…', () => void choose()),
      openMd,
    );
  };
  const writeNow = async () => {
    if (!fileHandle) return;
    fileState = 'saving';
    renderFile();
    try {
      await writeFile(fileHandle, await generateMarkdown(mdPayload, reviewState));
      fileState = 'saved';
    } catch (error) {
      fileState = 'error';
      fileError = String(error instanceof Error ? error.message : error);
    }
    renderFile();
  };
  const scheduleWrite = () => {
    if (!fileHandle || fileState === 'pending') return;
    clearTimeout(writeTimer);
    fileState = 'saving';
    renderFile();
    writeTimer = setTimeout(() => {
      writing = writing.then(writeNow);
    }, 500);
  };
  const maybePrompt = () => {
    if ((fileState === 'none' && !promptDismissed) || fileState === 'pending') {
      renderFile();
      setTimeout(() => {
        saveMenu.open = true;
      });
    }
  };
  const grant = async (handle: FileHandle) => {
    if (
      (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted' &&
      (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted'
    )
      throw Error('沒有取得檔案的寫入權限');
  };
  const remember = async (handle: FileHandle) => {
    fileHandle = handle;
    try {
      await handleStore().save(fileKey, handle);
    } catch {
      /* the shortcut is lost, the file still works */
    }
  };
  const choose = async () => {
    try {
      const handle = await chooseSaveFile(suggestedName);
      await grant(handle);
      await remember(handle);
      // Queue behind any write in progress, and drop a pending one: this write covers it.
      clearTimeout(writeTimer);
      await (writing = writing.then(writeNow));
      if (fileState === 'saved') say(`已設定進度檔：${handle.name}`);
    } catch (error) {
      if (!isCancel(error)) say(`無法設定進度檔：${String(error)}`, 'error');
    }
  };
  /** Read `handle` into the page; with `since`, give up (returning false) when a decision
   * was made after that edit count, so the person's newer choices are not overwritten. */
  const load = async (handle: FileHandle, since?: number) => {
    await grant(handle);
    const file = await handle.getFile();
    if (file.size > 64 * 1024 * 1024) throw Error('檔案超過 64 MiB 安全上限');
    const text = await file.text(),
      imported = text.trim() ? await importMarkdown(text, mdPayload) : undefined;
    if (since !== undefined && edits !== since) return false;
    if (imported) applyImported(imported);
    await remember(handle);
    fileState = 'saved';
    renderFile();
    render();
    return true;
  };
  const resume = async (since?: number) => {
    const handle = fileHandle;
    if (!handle) return;
    try {
      if (await load(handle, since)) say(`已載入上次進度：${handle.name}`);
      else {
        // Decided before the remembered file arrived: keep those decisions and let the
        // person choose whether the file replaces them.
        fileState = 'pending';
        renderFile();
        saveMenu.open = true;
      }
    } catch (error) {
      fileState = 'pending';
      renderFile();
      say(`無法載入上次進度：${String(error)}`, 'error');
    }
  };
  const openProgress = async () => {
    if (!autosaveSupported()) {
      fileInput.click();
      return;
    }
    try {
      const handle = await chooseOpenFile();
      await load(handle);
      say('已開啟 md');
    } catch (error) {
      if (!isCancel(error)) say(`開啟失敗：${String(error)}`, 'error');
    }
  };
  const changed = () => {
    persist();
    scheduleWrite();
    maybePrompt();
    renderExport();
    render();
  };
  const decide = {
    screen: (id: string, value: Decision) => {
      reviewState = setScreen(reviewState, id, value);
      changed();
    },
    component: (screenId: string, componentId: string, value: Decision) => {
      reviewState = setComponent(reviewState, screenId, componentId, value);
      highlightComponent = componentId;
      changed();
    },
    api: (id: string, value: Decision) => {
      reviewState = setApi(reviewState, id, value);
      selectedApi = id;
      changed();
    },
    feature: (key: string, value: Decision) => {
      reviewState = setFeature(reviewState, key, value);
      changed();
    },
  };
  /** Typing a note keeps it and saves it, without rebuilding anything the person is typing in. */
  let noteDirty = false;
  const keepNote = (next: ReviewState) => {
    reviewState = next;
    noteDirty = true;
    persist();
    scheduleWrite();
    renderExport();
  };
  const note = {
    screen: (screenId: string, componentId: string | undefined, value: DecisionNote) => {
      try {
        keepNote(
          componentId === undefined
            ? setDecisionNote(reviewState, 'screen', screenId, value)
            : setDecisionNote(reviewState, 'component', screenId, componentId, value),
        );
      } catch (error) {
        say(`備註未儲存：${String(error instanceof Error ? error.message : error)}`, 'error');
      }
    },
    api: (id: string, value: DecisionNote) => {
      try {
        keepNote(setDecisionNote(reviewState, 'api', id, value));
      } catch (error) {
        say(`備註未儲存：${String(error instanceof Error ? error.message : error)}`, 'error');
      }
    },
    feature: (key: string, value: DecisionNote) => {
      try {
        keepNote(setDecisionNote(reviewState, 'feature', key, value));
      } catch (error) {
        say(`備註未儲存：${String(error instanceof Error ? error.message : error)}`, 'error');
      }
    },
    /** Leaving a note field: show its new state (the 「已填」 mark, counts) once typing is done. */
    commit: () => {
      if (!noteDirty) return;
      noteDirty = false;
      maybePrompt();
      // Rebuilding now would swallow the click that moved focus away; wait until it has landed.
      setTimeout(render);
    },
  };
  window.addEventListener('beforeunload', (event) => {
    // Once per visit: marks only in this browser are lost with its data, so say so before leaving.
    if (reminded || !unsaved()) return;
    reminded = true;
    event.preventDefault();
    event.returnValue = '';
  });

  const renderProgress = () => {
    const counts = statistics(graph, reviewState),
      done = counts.screens.KEEP + counts.screens.REMOVE,
      total = index.screens.length,
      issues = conflicts(graph, reviewState),
      apiIssues = apiConflicts(graph, reviewState);
    // The count, a bar of what is kept and removed, and the conflicts, always in sight (ADR 0189).
    const meter = element('span', undefined, 'progress-meter'),
      bar = element('span', undefined, 'progress-bar');
    for (const value of ['KEEP', 'REMOVE'] as const) {
      const part = element('span', undefined, `progress-part decision-${value}`);
      part.style.width = `${total ? (counts.screens[value] / total) * 100 : 0}%`;
      bar.append(part);
    }
    bar.setAttribute('aria-hidden', 'true');
    const line = element('span', undefined, 'progress-line');
    line.append(
      element('span', `已確認 ${done}／${total}`, 'progress-count'),
      element(
        'span',
        `保留 ${counts.screens.KEEP} · 移除 ${counts.screens.REMOVE}`,
        'progress-split',
      ),
    );
    meter.append(line, bar);
    progressSummary.replaceChildren(meter);
    const conflictTotal = issues.length + apiIssues.length;
    if (conflictTotal) {
      const pill = element('span', undefined, 'conflict-pill');
      pill.dataset.conflictPill = String(conflictTotal);
      pill.append(icon('warning'), element('span', `${conflictTotal} 衝突`));
      progressSummary.append(pill);
    }
    progressSummary.append(icon('more'));
    progressSummary.dataset.done = String(done);
    progressPanel.replaceChildren(element('h2', '確認進度'));
    const row = (label: string, value: Filter, count: number) => {
      const button = element('button', undefined, 'progress-row');
      button.dataset.progressFilter = value;
      button.append(element('span', label), element('strong', String(count)));
      button.onclick = () => {
        filter = value;
        progress.open = false;
        page = 'screens';
        render();
      };
      return button;
    };
    progressPanel.append(
      element('h3', '畫面'),
      row('保留', 'KEEP', counts.screens.KEEP),
      row('移除', 'REMOVE', counts.screens.REMOVE),
      row('未確認', 'UNDECIDED', counts.screens.UNDECIDED),
    );
    progressPanel.append(
      element('h3', '按鈕'),
      element(
        'p',
        `保留 ${counts.components.KEEP} · 移除 ${counts.components.REMOVE} · 隨畫面移除 ${counts.inherited}`,
        'muted',
      ),
    );
    const fieldTotal = counts.fields.KEEP + counts.fields.REMOVE + counts.fields.UNDECIDED;
    if (fieldTotal) {
      const line = element(
        'p',
        `保留 ${counts.fields.KEEP} · 移除 ${counts.fields.REMOVE} · 隨畫面移除 ${counts.fieldsInherited}`,
        'muted',
      );
      line.dataset.progressFields = 'true';
      progressPanel.append(element('h3', '欄位'), line);
    }
    const apiLine = element('p', `保留 ${counts.apis.KEEP} · 移除 ${counts.apis.REMOVE}`, 'muted');
    apiLine.dataset.progressApis = 'true';
    progressPanel.append(element('h3', 'API（直接標記）'), apiLine);
    const featureCounts = { KEEP: 0, REMOVE: 0 };
    for (const feature of featureList) {
      const value = featureDecision(reviewState, feature.key);
      if (value !== 'UNDECIDED') featureCounts[value]++;
    }
    const featureLine = element(
      'p',
      `保留 ${featureCounts.KEEP} · 移除 ${featureCounts.REMOVE} · 畫面隨功能決定 ${counts.screensInherited}`,
      'muted',
    );
    featureLine.dataset.progressFeatures = 'true';
    progressPanel.append(element('h3', '功能'), featureLine);
    const conflictBox = element('div', undefined, 'progress-conflicts'),
      conflictCount = issues.length + apiIssues.length;
    conflictBox.dataset.conflictCount = String(conflictCount);
    conflictBox.append(element('h3', `衝突 ${conflictCount} 個`));
    if (!conflictCount) conflictBox.append(element('p', '沒有衝突', 'muted'));
    for (const issue of apiIssues) {
      const api = index.nodes.get(issue.apiId),
        link = element(
          'button',
          `API ${api ? `${api.attributes.httpMethod || api.attributes.method || ''} ${api.attributes.path || api.attributes.route || api.name}`.trim() : issue.apiId}：${issue.decision === 'KEEP' ? '標記保留，但呼叫來源都已移除' : '標記移除，但仍有呼叫來源'}`,
          'link-row',
        );
      link.dataset.apiConflictLink = issue.apiId;
      link.onclick = () => {
        progress.open = false;
        showApi(issue.apiId);
      };
      conflictBox.append(link);
    }
    for (const issue of issues) {
      const link = element(
        'button',
        `${index.nodes.get(issue.screenId)?.name || '畫面'} → ${index.nodes.get(issue.targetScreenId)?.name || '畫面'}`,
        'link-row',
      );
      link.onclick = () => {
        progress.open = false;
        openScreen(issue.screenId, { component: issue.componentId });
      };
      conflictBox.append(link);
    }
    progressPanel.append(conflictBox);
  };

  const renderSidebar = () => {
    const counts = statistics(graph, reviewState).screens;
    railCount.textContent = `未確認 ${counts.UNDECIDED}`;
    chips.replaceChildren();
    const filterName = (value: 'ALL' | 'UNDECIDED' | 'KEEP' | 'REMOVE') =>
      value === 'ALL' ? '全部' : decisionLabel(value);
    for (const value of ['ALL', 'UNDECIDED', 'KEEP', 'REMOVE'] as const) {
      const chip = element('button', undefined, 'filter-chip');
      chip.type = 'button';
      chip.append(
        element('span', filterName(value)),
        element(
          'span',
          String(value === 'ALL' ? index.screens.length : counts[value]),
          'filter-count',
        ),
      );
      chip.dataset.stateFilter = value;
      chip.setAttribute('aria-pressed', String(filter === value));
      chip.onclick = () => {
        filter = value;
        render();
      };
      chips.append(chip);
    }
    listButton.setAttribute('aria-pressed', String(listMode === 'list'));
    filesButton.setAttribute('aria-pressed', String(listMode === 'files'));
    featuresButton.setAttribute('aria-pressed', String(listMode === 'features'));
    const visible = visibleScreens(),
      matches = searchScreens(index, query);
    if (listMode === 'files') {
      list.replaceChildren(fileTree(index, query, (id) => openScreen(id), { visible, current }));
      return;
    }
    list.replaceChildren();
    const shown = (id: string) => !(visible && !visible.has(id)) && !(query && !matches.has(id));
    const conflicted = new Set(conflicts(graph, reviewState).map((c) => c.screenId));
    const row = (id: string, persona?: PersonaView, roleKey?: string) => {
      const screen = index.nodes.get(id)!,
        status = screenState(id),
        button = element('button', undefined, 'screen-row');
      button.dataset.screenList = id;
      button.dataset.decision = status;
      button.setAttribute('aria-current', current === id ? 'page' : 'false');
      const label = element('span', undefined, 'screen-row-text');
      label.append(
        element('strong', screen.name),
        element('code', index.routes.get(id)?.[0] || text.noUrl),
      );
      button.append(label);
      // Under a role's heading: the step the role first sees the screen at, and 「可能」 when the role may not get there.
      const role = roleKey ? personaViews.find((v) => v.persona.id === roleKey) : undefined,
        step = role?.depth.get(id);
      if (step !== undefined) {
        const number = element('span', String(step), 'screen-row-step');
        number.title = `第 ${step} 步`;
        button.prepend(number);
      }
      if (role?.reach.get(id) === 'POSSIBLE') {
        const maybe = element('span', '可能', 'screen-row-maybe');
        maybe.title = reachHelp.POSSIBLE;
        button.append(maybe);
      }
      if (conflicted.has(id)) {
        const warn = icon('warning');
        warn.classList.add('screen-row-conflict');
        warn.setAttribute('role', 'img');
        warn.setAttribute('aria-label', '有衝突');
        button.append(warn);
      }
      if (persona) {
        const reach = persona.reach.get(id)!,
          tag = element('span', reachLabel[reach], 'persona-reach');
        tag.dataset.reach = reach;
        button.dataset.personaReach = reach;
        button.append(tag);
      }
      if (status !== 'UNDECIDED') {
        const mark = icon(status === 'KEEP' ? 'check' : 'close'),
          inherited = screenInherited(graph, reviewState, id);
        mark.classList.add('status-mark', `decision-${status}`);
        if (inherited) {
          mark.classList.add('is-inherited');
          button.dataset.inherited = 'true';
        }
        mark.setAttribute('role', 'img');
        mark.setAttribute(
          'aria-label',
          inherited ? `隨功能${decisionLabel(status)}` : decisionLabel(status),
        );
        button.append(mark);
      } else {
        // Undecided screens show an empty dashed ring, so every row says where it stands.
        const open = element('span', undefined, 'status-open');
        open.setAttribute('role', 'img');
        open.setAttribute('aria-label', decisionLabel('UNDECIDED'));
        button.append(open);
      }
      button.onclick = () => openScreen(id);
      return button;
    };
    const persona = activePersona();
    if (persona) {
      // The persona's flow: what it is, then its screens step by step from the start URL.
      const summary = element('section', undefined, 'persona-summary');
      summary.dataset.personaSummary = persona.persona.id;
      summary.dataset.roleTint = roleTint(graph, persona.persona.id);
      const about = personaDescription(persona.persona);
      summary.append(element('strong', persona.persona.name));
      if (about) summary.append(element('p', about));
      summary.append(element('p', reachSummary(persona), 'muted'));
      const facts = element('details', undefined, 'persona-conditions');
      facts.append(
        element('summary', '判定條件'),
        element(
          'p',
          persona.persona.facts.map(factLabel).join('、') || '（沒有條件）',
          'persona-facts-line',
        ),
      );
      summary.append(facts);
      list.append(summary);
      for (const group of flowGroups(index, persona)) {
        // The list is the role's flow, step by step; screens it does not reach are left out.
        if (group.reach === 'UNREACHED' || group.reach === 'EXCLUDED') continue;
        const ids = group.screens.filter(shown);
        if (!ids.length) continue;
        const section = element('div', undefined, 'persona-group');
        section.dataset.personaGroup = group.key;
        const title = element('h3', `${group.title} · ${ids.length}`);
        section.append(title);
        for (const id of ids) section.append(row(id, persona));
        list.append(section);
      }
      if (!list.querySelector('.screen-row'))
        list.append(element('p', '沒有符合的畫面', 'empty-list'));
      return;
    }
    // With roles, each role heads its own part of the list (ADR 0188).
    const roles = rolePartition(index);
    const roleHeading = (key: string, label: string, count: number) => {
      const heading = element('div', undefined, 'role-heading');
      heading.dataset.roleTint = roleTint(graph, key);
      heading.append(icon('persona'), element('span', label), element('span', `${count}`, 'muted'));
      return heading;
    };
    if (listMode === 'features') {
      const byRole = roles
        ? featuresByRole(featureList, roles)
        : [{ key: '', label: '', screens: 0, features: featureList }];
      for (const group of byRole) {
        if (group.key) {
          const shownCount = group.features.flatMap((f) => f.screens).filter(shown).length;
          if (shownCount) list.append(roleHeading(group.key, group.label, shownCount));
        }
        appendFeatures(group.features, group.key);
      }
      if (!list.querySelector('.screen-row'))
        list.append(element('p', '沒有符合的畫面', 'empty-list'));
      return;
    }
    if (roles) {
      for (const key of roles.keys) {
        const ids = orderedScreens.filter((s) => roles.of.get(s.id) === key && shown(s.id));
        if (!ids.length) continue;
        list.append(roleHeading(key, roles.label(key), ids.length));
        for (const screen of ids) list.append(row(screen.id, undefined, key));
      }
      if (!list.childElementCount) list.append(element('p', '沒有符合的畫面', 'empty-list'));
      return;
    }
    for (const screen of orderedScreens) if (shown(screen.id)) list.append(row(screen.id));
    if (!list.childElementCount) list.append(element('p', '沒有符合的畫面', 'empty-list'));
    return;
    function appendFeatures(features: typeof featureList, roleKey: string) {
      // Screens under their feature, in the order its flows reach them.
      for (const feature of features) {
        const ids = feature.flows.flatMap((flow) => flow.screens).filter(shown);
        if (!ids.length) continue;
        const fold = roleKey ? `${roleKey}\u0000${feature.key}` : feature.key;
        const section = element('details', undefined, 'feature-group'),
          summary = element('summary'),
          decision = featureDecision(reviewState, feature.key);
        section.dataset.featureGroup = feature.key;
        section.open = !featuresCollapsed.has(fold) || ids.includes(current || '');
        // Written like the canvas group titles: 「/admin · 3 個畫面」.
        const name = element('span', undefined, 'feature-group-name');
        name.append(feature.label, element('span', ` · ${ids.length} 個畫面`, 'muted'));
        summary.append(name);
        if (decision !== 'UNDECIDED') {
          const mark = icon(decision === 'KEEP' ? 'check' : 'close');
          mark.classList.add('status-mark', `decision-${decision}`);
          mark.setAttribute('role', 'img');
          mark.setAttribute('aria-label', `功能${decisionLabel(decision)}`);
          summary.append(mark);
        }
        const chevron = icon('chevronRight');
        chevron.classList.add('feature-group-chevron');
        summary.append(chevron);
        section.addEventListener('toggle', () => {
          if (section.open) featuresCollapsed.delete(fold);
          else featuresCollapsed.add(fold);
        });
        const items = element('div', undefined, 'feature-group-items');
        for (const id of ids) items.append(row(id));
        section.append(summary, items);
        list.append(section);
      }
    }
  };

  // The screen list is the review queue: it stays beside an open screen and folds into a rail only when asked (ADR 0189).
  let listCollapsed = false;
  const syncList = () => {
    shell.dataset.sidebar = listCollapsed ? 'collapsed' : 'expanded';
    sidebarBody.inert = listCollapsed;
    expandList.setAttribute('aria-expanded', 'false');
    collapseList.setAttribute('aria-expanded', 'true');
  };
  const setList = (
    collapsed: boolean,
    focus: HTMLElement = collapsed ? expandList : collapseList,
  ) => {
    listCollapsed = collapsed;
    syncList();
    focus.focus();
  };
  expandList.onclick = () => setList(false);
  railSearch.onclick = () => setList(false, search);
  collapseList.onclick = () => setList(true);
  nextButton.onclick = () => nextUndecided();
  railNext.onclick = () => nextUndecided();
  let detailsCollapsed = false;
  const syncDetails = () => {
    shell.dataset.details =
      page !== 'screens' || !current ? 'hidden' : detailsCollapsed ? 'collapsed' : 'open';
    panelBody.inert = shell.dataset.details !== 'open';
    collapseDetails.inert = shell.dataset.details !== 'open';
    expandDetails.setAttribute('aria-expanded', 'false');
    collapseDetails.setAttribute('aria-expanded', 'true');
  };
  const setDetails = (collapsed: boolean) => {
    detailsCollapsed = collapsed;
    syncDetails();
    (collapsed ? expandDetails : collapseDetails).focus();
  };
  expandDetails.onclick = () => setDetails(false);
  collapseDetails.onclick = () => setDetails(true);
  const renderPanel = () => {
    if (page !== 'screens' || !current) {
      panelBody.replaceChildren();
      railDecide.replaceChildren();
      return;
    }
    // Folded, the panel still decides: K／X／U as three buttons, and a warning when the screen has a conflict.
    const id = current;
    railDecide.replaceChildren(
      decisionSwitch('這個畫面', screenDecision(reviewState, id), (v) => decide.screen(id, v), {
        compact: true,
        screen: id,
      }),
    );
    if (conflicts(graph, reviewState).some((c) => c.screenId === id || c.targetScreenId === id)) {
      const warn = icon('warning');
      warn.classList.add('rail-conflict');
      warn.setAttribute('role', 'img');
      warn.setAttribute('aria-label', '有衝突');
      railDecide.append(warn);
    }
    const shown = panel.querySelector<HTMLDetailsElement>(
      `[data-screen-panel="${CSS.escape(current)}"] .panel-buttons`,
    );
    if (shown) buttonsOpen = shown.open || (buttonsOpen && !!highlightComponent);
    const fieldsShown = panel.querySelector<HTMLDetailsElement>(
      `[data-screen-panel="${CSS.escape(current)}"] .panel-fields`,
    );
    if (fieldsShown) fieldsOpen = fieldsShown.open;
    const feature = featureByScreen.get(current);
    screenPanel(panelBody, index, reviewState, current, {
      inherited: screenInherited(graph, reviewState, current)
        ? { decision: screenState(current), feature: feature?.label || '' }
        : undefined,
      setScreen: decide.screen,
      setComponent: decide.component,
      setNote: note.screen,
      commitNote: note.commit,
      notesOpen,
      fieldsOpen,
      onFieldsToggle: (open) => {
        fieldsOpen = open;
      },
      api: (id) => showApi(id),
      tab: panelTab,
      onTab: (tab) => {
        panelTab = tab;
      },
      buttonsOpen,
      onButtonsToggle: (open) => {
        buttonsOpen = open;
      },
      highlight: highlightComponent,
      positions: (() => {
        const found = previewPositions(current);
        return found.size ? found : undefined;
      })(),
      hover: (id) => pointAt(id),
      locate: (id) => locate(id),
    });
    // Whose screen this is and at which step of that role's flow, at the top of the panel.
    const roles = rolePartition(index),
      roleKey = roles?.of.get(current);
    if (roles && roleKey) {
      const tag = element('div', undefined, 'panel-role'),
        chip = element('span', roles.label(roleKey), 'panel-role-chip'),
        view = personaViews.find((v) => v.persona.id === roleKey),
        step = view?.depth.get(current);
      chip.dataset.roleTint = roleTint(graph, roleKey);
      tag.append(chip);
      if (step !== undefined) tag.append(element('span', `第 ${step} 步`, 'muted'));
      if (view?.reach.get(current) === 'POSSIBLE')
        tag.append(element('span', '可能走到', 'panel-maybe'));
      panelBody.querySelector('.panel-header')?.prepend(tag);
    }
    const persona = activePersona();
    if (persona) {
      const reach = persona.reach.get(current)!,
        note = element(
          'p',
          `角色「${persona.persona.name}」：${reachText(persona, current)}`,
          'persona-status',
        );
      note.dataset.personaStatus = reach;
      panelBody.querySelector('.panel-header')?.append(note);
    }
    if (highlightComponent) {
      const row = panel.querySelector<HTMLElement>(
          `[data-component-row="${CSS.escape(highlightComponent)}"]`,
        ),
        tab = row?.closest<HTMLElement>('[data-tab-panel]')?.dataset.tabPanel as
          PanelTab | undefined;
      if (tab && tab !== panelTab) {
        panelTab = tab;
        showPanelTab(panel, tab);
      }
      requestAnimationFrame(() => row?.scrollIntoView({ block: 'nearest' }));
    }
  };

  // ---- main area: the canvas (zooming into the open screen) or the API page
  let simulation: ReturnType<typeof attachSimulation> | undefined,
    view: CanvasView | undefined,
    stage: (Stage & { id: string }) | undefined,
    frame: HTMLIFrameElement | undefined,
    viewer: HTMLElement | undefined;
  const thumbnail = (id: string) => {
    const value = payload.preview.screens?.find((s) => s.graphScreenId === id)?.thumbnail;
    return value?.startsWith('data:image/') ? value : undefined;
  };
  /** With a persona chosen, the map keeps only the screens on its flow unless the person asks for the rest. */
  const mapScreens = (): Set<string> | undefined => {
    const base = visibleScreens(),
      persona = activePersona();
    if (!persona || showUnreached) return base;
    return new Set(
      index.screens
        .filter((s) => persona.depth.has(s.id) && (!base || base.has(s.id)))
        .map((s) => s.id),
    );
  };
  const canvasState = () => ({
    query,
    visible: mapScreens(),
    screenStatus: (id: string) => screenState(id),
    persona: activePersona(),
  });
  const nodesFor = (doc: Document, id: string, component: string) => {
    const nodes = new Set<HTMLElement>(
      doc.querySelectorAll<HTMLElement>(`[data-st-component-id="${CSS.escape(component)}"]`),
    );
    for (const record of payload.preview.elements || [])
      if (record.graphScreenId === id && record.graphComponentId === component)
        try {
          const node = doc.querySelector<HTMLElement>(previewSelector(record.path));
          if (node) nodes.add(node);
        } catch {}
    return [...nodes];
  };
  /** Top-left of each button in the captured preview; buttons that were not visible there have no entry. */
  const previewPositions = (id: string) => {
    const result = new Map<string, { x: number; y: number }>();
    for (const record of payload.preview.elements || []) {
      if (
        record.graphScreenId !== id ||
        !record.graphComponentId ||
        !record.bounds ||
        record.bounds.width <= 0 ||
        record.bounds.height <= 0
      )
        continue;
      const old = result.get(record.graphComponentId),
        { x, y } = record.bounds;
      if (!old || y < old.y || (y === old.y && x < old.x))
        result.set(record.graphComponentId, { x, y });
    }
    return result;
  };
  /** A dashed frame drawn over the button, so the page's own styles and decision outlines stay untouched. */
  const pointAt = (component: string | undefined) => {
    stage?.light(component);
    const doc = frame?.contentDocument;
    if (!doc || !current) return;
    doc.querySelectorAll('[data-st-viewer-pointer]').forEach((node) => node.remove());
    if (!component) return;
    for (const node of nodesFor(doc, current, component)) {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const box = doc.createElement('div');
      box.dataset.stViewerPointer = 'true';
      box.style.cssText = `position:absolute;left:${rect.left + doc.defaultView!.scrollX - 4}px;top:${rect.top + doc.defaultView!.scrollY - 4}px;width:${rect.width + 8}px;height:${rect.height + 8}px;border:3px dashed #eab308;border-radius:6px;pointer-events:none;z-index:2147483646;box-sizing:border-box;`;
      doc.body.append(box);
    }
  };
  const markRow = (component: string) => {
    panel
      .querySelectorAll('.button-row.is-highlighted')
      .forEach((row) => row.classList.remove('is-highlighted'));
    const row = panel.querySelector<HTMLElement>(`[data-component-row="${CSS.escape(component)}"]`);
    if (!row) return;
    row.classList.add('is-highlighted');
    // A field's row is on the fields tab: show that tab first.
    const tab = row.closest<HTMLElement>('[data-tab-panel]')?.dataset.tabPanel as
      PanelTab | undefined;
    if (tab && tab !== panelTab) {
      panelTab = tab;
      showPanelTab(panel, tab);
    }
    for (let parent = row.parentElement; parent && parent !== panel; parent = parent.parentElement)
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    buttonsOpen = true;
    row.scrollIntoView({ block: 'nearest' });
  };
  /** From the list: keep the button highlighted in the preview and bring it into view. */
  const locate = (component: string) => {
    highlightComponent = component;
    markRow(component);
    const doc = frame?.contentDocument;
    if (!doc || !current) return;
    decorate(doc, current);
    const node = doc.querySelector<HTMLElement>('[data-spotlight]');
    if (node)
      revealInPreview(node, frame!, viewer?.querySelector('.prototype-scroll') ?? null, 'smooth');
  };
  /** From the preview: show which list row a clicked button is. */
  const selectFromPreview = (doc: Document, id: string) => {
    const owners = new Map<Element, string>();
    for (const record of payload.preview.elements || []) {
      if (record.graphScreenId !== id || !record.graphComponentId) continue;
      try {
        const node = doc.querySelector(previewSelector(record.path));
        if (node) owners.set(node, record.graphComponentId);
      } catch {
        /* an unreadable path maps nothing */
      }
    }
    const ownerOf = (target: EventTarget | null) => {
      for (let node = target as Element | null; node; node = node.parentElement) {
        const component = owners.get(node);
        if (component) return component;
      }
      return undefined;
    };
    doc.addEventListener(
      'click',
      (event) => {
        const component = ownerOf(event.target);
        if (component) {
          highlightComponent = component;
          markRow(component);
          decorate(doc, id);
        }
      },
      true,
    );
    // Pointing at a button in the preview marks the flow cards it leads to.
    doc.addEventListener('mouseover', (event) => {
      if (current === id) stage?.light(ownerOf(event.target));
    });
    doc.documentElement.addEventListener('mouseleave', () => {
      if (current === id) stage?.light(undefined);
    });
  };
  // ---- how far the preview can be trusted (ADR 0157): demo data and content shown only under conditions
  let showTrust = false;
  const PAGE_STATES: [string, string][] = [
    ['', '有資料'],
    ['loading', '載入中'],
    ['error', '發生錯誤'],
    ['empty', '沒有資料'],
  ];
  const TRUST_STYLE = `[data-st-viewer-trust~="demo"]:not([data-review-status]):not([data-spotlight]){outline:2px dashed #2563eb!important;outline-offset:1px}
[data-st-viewer-trust~="conditional"]:not([data-review-status]):not([data-spotlight]){outline:2px dashed #d97706!important;outline-offset:3px}
[data-st-viewer-trust~="demo"][data-st-viewer-trust~="conditional"]:not([data-review-status]):not([data-spotlight]){outline-style:dotted!important}
.st-dynamic-placeholder{outline:2px solid #64748b!important}`;
  /** Marks, inside the preview, what is demonstration data and what only shows under some condition. */
  const applyTrust = (doc: Document, id: string) => {
    doc
      .querySelectorAll('[data-st-viewer-trust]')
      .forEach((n) => n.removeAttribute('data-st-viewer-trust'));
    doc.getElementById('st-viewer-trust-style')?.remove();
    if (!showTrust) return;
    const style = doc.createElement('style');
    style.id = 'st-viewer-trust-style';
    style.textContent = TRUST_STYLE;
    (doc.head || doc.documentElement).append(style);
    const mark = (node: Element | null, token: 'demo' | 'conditional') => {
      if (!node) return;
      const tokens = new Set(
        (node.getAttribute('data-st-viewer-trust') || '').split(' ').filter(Boolean),
      );
      tokens.add(token);
      node.setAttribute('data-st-viewer-trust', [...tokens].sort().join(' '));
    };
    // Demo data: rows and values the preview filled in, and every field that prints data.
    doc
      .querySelectorAll(
        '[data-st-demo-row],[data-st-demo-text],[data-st-demo-parts],[data-st-demo-key]',
      )
      .forEach((node) => mark(node, 'demo'));
    doc.querySelectorAll('[data-st-conditional]').forEach((node) => mark(node, 'conditional'));
    for (const record of payload.preview.elements || []) {
      if (record.graphScreenId !== id) continue;
      const kind = record.graphComponentId
          ? index.nodes.get(record.graphComponentId)?.attributes.kind
          : undefined,
        conditional = !!(record as { conditions?: unknown[] }).conditions?.length;
      if (kind !== 'DISPLAY_FIELD' && !conditional) continue;
      let node: Element | null = null;
      try {
        node = doc.querySelector(previewSelector(record.path));
      } catch {
        continue;
      }
      if (kind === 'DISPLAY_FIELD') mark(node, 'demo');
      if (conditional) mark(node, 'conditional');
    }
  };
  /** Decision outlines and badges inside the preview, reapplied in place whenever decisions change. */
  const decorate = (doc: Document, id: string) => {
    doc.querySelectorAll('[data-review-badge]').forEach((node) => node.remove());
    doc.querySelectorAll<HTMLElement>('[data-review-status],[data-spotlight]').forEach((node) => {
      node.style.outline = node.dataset.originalOutline || '';
      delete node.dataset.reviewStatus;
      delete node.dataset.spotlight;
    });
    for (const record of payload.preview.elements || []) {
      if (record.graphScreenId !== id || !record.graphComponentId) continue;
      const decided = componentDecision(reviewState, id, record.graphComponentId) !== 'UNDECIDED',
        spotlight = record.graphComponentId === highlightComponent;
      if (!decided && !spotlight) continue;
      let node: HTMLElement | null = null;
      try {
        node = doc.querySelector<HTMLElement>(previewSelector(record.path));
      } catch {
        continue;
      }
      if (!node) continue;
      if (node.dataset.originalOutline === undefined)
        node.dataset.originalOutline = node.style.outline;
      if (spotlight) {
        node.style.outline = '3px solid #eab308';
        node.dataset.spotlight = 'true';
      }
      if (!decided) continue;
      const effective = effectiveComponent(reviewState, id, record.graphComponentId, graph),
        color = effective === 'KEEP' ? '#13795b' : '#b42318';
      node.dataset.reviewStatus = effective;
      if (!spotlight) node.style.outline = `3px solid ${color}`;
      const badge = doc.createElement('span');
      badge.dataset.reviewBadge = record.graphComponentId;
      badge.textContent = decisionLabel(effective);
      badge.style.cssText = `display:inline-block;background:${color};color:white;font:600 11px system-ui;padding:2px 5px;border-radius:4px;pointer-events:none;`;
      placeBadge(node, badge);
    }
    applyTrust(doc, id);
  };
  // Building a preview inlines its images and takes long enough to stall the zoom, so it is prepared as soon as
  // the person points at a screen; decisions are applied on load, so a prepared document never goes stale.
  const prepared = new Map<string, string>();
  let preparing: string | undefined;
  const previewHtml = (id: string) => {
    let html = prepared.get(id);
    if (html === undefined) html = previewDocument(payload, id);
    prepared.delete(id);
    prepared.set(id, html);
    if (prepared.size > 4) prepared.delete(prepared.keys().next().value!);
    return html;
  };
  const prepare = (id: string | undefined) => {
    if (!id || prepared.has(id) || preparing === id || !index.nodes.has(id)) return;
    preparing = id;
    setTimeout(() => {
      if (preparing === id) {
        preparing = undefined;
        previewHtml(id);
      }
    }, 0);
  };
  const renderFocus = (id: string, host: HTMLElement) =>
    new Promise<void>((shown) => {
      const preview = element('section', undefined, 'preview'),
        notice = element('span', '示意畫面：資料為範例值，不是真實系統', 'preview-notice'),
        trust = element('button', undefined, 'trust-toggle'),
        legend = element('div', undefined, 'trust-legend');
      trust.type = 'button';
      trust.dataset.trustToggle = 'true';
      trust.append(icon('info'), element('span', '標示示範內容'));
      trust.title = '框出示範資料與依條件才出現的內容';
      legend.dataset.trustLegend = 'true';
      legend.append(
        element('span', '藍色虛線：示範資料，不是真實資料', 'trust-key trust-demo'),
        element('span', '橘色虛線：依條件才顯示（權限、狀態等）', 'trust-key trust-conditional'),
        element('span', '灰框：無法確定的動態內容', 'trust-key trust-dynamic'),
      );
      const syncTrust = () => {
        trust.setAttribute('aria-pressed', String(showTrust));
        legend.hidden = !showTrust;
      };
      // Loading, error and empty content stays hidden until asked for, one state at a time (ADR 0162).
      const pageStates = element('div', undefined, 'segmented page-state-switch');
      pageStates.dataset.pageStateSwitch = 'true';
      pageStates.setAttribute('role', 'group');
      pageStates.setAttribute('aria-label', '畫面狀態');
      pageStates.title =
        '依程式中的條件名稱（loading、error、清單長度為 0 等）判斷，可能不完全準確';
      pageStates.hidden = true;
      // States of one JSP page are separate screens (ADR 0183); the switch moves between them (ADR 0185).
      const screenStates = element('div', undefined, 'segmented page-state-switch');
      screenStates.dataset.screenStateSwitch = 'true';
      screenStates.setAttribute('role', 'group');
      screenStates.setAttribute('aria-label', '流程狀態');
      screenStates.title = '依原始碼中的狀態條件與送出按鈕推論；每個狀態是獨立的畫面';
      const stateBase = index.nodes.get(id)?.attributes.stateVariantOf || id,
        family = [...index.nodes.values()]
          .filter(
            (n) =>
              n.type === 'SCREEN' &&
              n.attributes.stateVariant &&
              (n.id === stateBase || n.attributes.stateVariantOf === stateBase),
          )
          .sort(
            (a, b) =>
              Number(a.attributes.jspStateOrder ?? 99) - Number(b.attributes.jspStateOrder ?? 99),
          );
      screenStates.hidden = family.length < 2;
      for (const state of family) {
        const button = element(
          'button',
          state.attributes.jspStateLabel || state.attributes.stateVariant,
        );
        button.type = 'button';
        button.setAttribute('aria-pressed', String(state.id === id));
        if (state.id !== id) button.onclick = () => openScreen(state.id, { simulated: true });
        screenStates.append(button);
      }
      const fillPageStates = (doc: Document) => {
        const present = new Set(
          [...doc.querySelectorAll('[data-st-state]')].map((n) => n.getAttribute('data-st-state')),
        );
        const states = PAGE_STATES.filter(([value]) => !value || present.has(value));
        pageStates.replaceChildren();
        pageStates.hidden = states.length < 2;
        const show = (value: string) => {
          if (value) doc.documentElement.setAttribute('data-st-show-state', value);
          else doc.documentElement.removeAttribute('data-st-show-state');
          for (const button of pageStates.querySelectorAll('button'))
            button.setAttribute('aria-pressed', String(button.dataset.pageState === value));
        };
        for (const [value, label] of states) {
          const button = element('button', label);
          button.type = 'button';
          button.dataset.pageState = value;
          button.onclick = () => show(value);
          pageStates.append(button);
        }
        show('');
      };
      syncTrust();
      trust.onclick = () => {
        showTrust = !showTrust;
        syncTrust();
        const doc = frame?.contentDocument;
        if (doc && current) applyTrust(doc, current);
      };
      frame = element('iframe');
      simulation = undefined;
      const own = frame;
      preview.setAttribute('aria-busy', 'true');
      own.setAttribute('sandbox', 'allow-same-origin');
      own.title = index.nodes.get(id)!.name;
      own.onload = () => {
        const doc = own.contentDocument;
        if (!doc || !own.getAttribute('srcdoc')) return;
        projectSimulationData(payload, id, doc);
        setJourney(payload, [...history.trail, id]);
        // Typed values follow the simulated flow; going back shows what was typed there.
        if (arrival !== 'direct')
          applyJourney(payload, id, doc, index.routes.get(id)?.[0] || '', arrival === 'history');
        const saved = arrival === 'history' ? history.current?.inputs : undefined;
        if (saved) restoreInputs(doc, saved);
        fillPageStates(doc);
        decorate(doc, id);
        selectFromPreview(doc, id);
        preview.setAttribute('aria-busy', 'false');
        shown();
        doc.addEventListener('keydown', onKey);
        simulation = attachSimulation(payload, id, own, viewer!, {
          focus: (target, notice) => openScreen(target, { notice, refresh: true, simulated: true }),
          api: (target) => showApi(target),
          thumbnail,
        });
        setTimeout(() => {
          if (current === id) prepare(nextUndecidedId());
        }, 800);
        const spotlight = doc.querySelector('[data-spotlight]');
        if (spotlight)
          revealInPreview(spotlight, own, viewer?.querySelector('.prototype-scroll') ?? null);
      };
      own.srcdoc = previewHtml(id);
      preview.append(own);
      const scroll = history.current?.screenId === id ? history.current.scroll : 0;
      viewer = prototypeViewer(index, payload, id, preview, own, history, {
        presenting,
        present: () => setPresenting(!presenting),
        back: () => showCanvas(),
        focus: (target) => openScreen(target),
        move: (delta) => {
          rememberInputs();
          const visit = history.move(delta, viewerScroll());
          if (visit) openScreen(visit.screenId, { push: false });
        },
        scroll,
      });
      // The notice sits beside the URL, outside the page, so it never covers the page's own buttons.
      viewer.querySelector('.prototype-present')?.before(notice, screenStates, pageStates, trust);
      viewer.querySelector('.prototype-status')?.after(legend);
      host.replaceChildren(viewer);
      // A simulated click that requested APIs on the way here says so on the screen it arrived at.
      if (pendingNotice) {
        const status = viewer.querySelector('.prototype-status');
        if (status) status.textContent = pendingNotice;
        pendingNotice = undefined;
      }
    });
  const highlightTriggers = (triggers: string[] | undefined) => {
    const doc = frame?.contentDocument;
    if (!doc || !current) return;
    doc.querySelectorAll<HTMLElement>('[data-line-trigger]').forEach((node) => {
      node.style.outline = node.dataset.lineTrigger || '';
      delete node.dataset.lineTrigger;
    });
    for (const component of triggers || [])
      for (const node of nodesFor(doc, current, component)) {
        node.dataset.lineTrigger = node.style.outline;
        node.style.outline = '3px solid #2347c5';
        revealInPreview(node, frame!, viewer?.querySelector('.prototype-scroll') ?? null);
      }
  };
  // Each persona has its own map laid out as its flow; switching persona builds that map and fits it anew.
  let canvasKey: string | undefined;
  const ensureCanvas = () => {
    const persona = activePersona(),
      key = persona?.persona.id || '';
    // Returning from a screen puts the same map back, where the person left it.
    if (view && canvasKey === key) {
      if (!main.contains(view.element)) main.replaceChildren(view.element);
      return view;
    }
    if (canvasKey !== undefined && canvasKey !== key) canvasTransform = undefined;
    canvasKey = key;
    // The persona bar moves into the new map; whatever in it had keyboard focus keeps it.
    const active = personaBar.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : undefined;
    view = canvas(index, payload, {
      ...canvasState(),
      transform: canvasTransform,
      onTransformChange: (state) => {
        canvasTransform = state;
      },
      onOpen: (id) => openScreen(id),
      onIntent: prepare,
      layout: persona ? personaLayout(index, persona) : undefined,
      toolbar: personaViews.length ? personaBar : undefined,
    });
    main.replaceChildren(view.element);
    active?.focus({ preventScroll: true });
    return view;
  };
  const viewerScroll = () => viewer?.querySelector('.prototype-scroll')?.scrollTop || 0;
  // The overview offers its three layouts in one place (ADR 0189): the free map, by feature, and by role step.
  const layoutSwitch = element('div', undefined, 'segmented layout-switch');
  layoutSwitch.setAttribute('role', 'group');
  layoutSwitch.setAttribute('aria-label', '總覽版面');
  const layouts: { key: 'canvas' | 'features' | 'personas'; label: string }[] = [
    ...(personaViews.length ? [{ key: 'personas' as const, label: '依角色步驟' }] : []),
    { key: 'features', label: '依功能' },
    { key: 'canvas', label: '自由畫布' },
  ];
  const layoutButtons = layouts.map((layout) => {
    const button = element('button', layout.label);
    button.type = 'button';
    button.dataset.overviewLayout = layout.key;
    button.onclick = () => {
      setPresenting(false);
      current = undefined;
      if (layout.key === 'personas') page = 'personas';
      else {
        page = 'screens';
        if (layout.key === 'features') listMode = 'features';
        else if (listMode === 'features') listMode = 'list';
      }
      render();
    };
    layoutSwitch.append(button);
    return button;
  });
  const mountLayoutSwitch = () => {
    const on = page === 'personas' ? 'personas' : listMode === 'features' ? 'features' : 'canvas';
    for (const button of layoutButtons)
      button.setAttribute('aria-pressed', String(button.dataset.overviewLayout === on));
    if (!main.contains(layoutSwitch)) main.append(layoutSwitch);
  };
  // Full-window preview keeps the review going: a floating bar to decide, move on and leave (ADR 0189).
  const presentBar = element('div', undefined, 'present-bar');
  presentBar.setAttribute('role', 'toolbar');
  presentBar.setAttribute('aria-label', '審查工具');
  const renderPresentBar = () => {
    if (!current) return;
    const id = current,
      counts = statistics(graph, reviewState).screens,
      next = element('button', undefined, 'present-next'),
      ways = element('span', undefined, 'present-ways');
    next.type = 'button';
    next.append(element('span', '下一個未確認'), element('kbd', 'n'));
    next.onclick = () => nextUndecided();
    // Leaving full window is on the top bar beside the screen's name; here: decide, see the ways, move on.
    ways.append(
      element('span', `進來 ${stage?.counts.in ?? 0}`, 'present-in'),
      element('span', `出去 ${stage?.counts.out ?? 0}`, 'present-out'),
    );
    const parts: HTMLElement[] = [
      decisionSwitch('這個畫面', screenDecision(reviewState, id), (v) => decide.screen(id, v), {
        screen: id,
        keys: true,
      }),
      ways,
    ];
    if (conflicts(graph, reviewState).some((c) => c.screenId === id || c.targetScreenId === id)) {
      const warn = element('span', undefined, 'present-conflict');
      warn.append(icon('warning'), element('span', '衝突'));
      parts.push(warn);
    }
    parts.push(
      next,
      element(
        'span',
        `已確認 ${counts.KEEP + counts.REMOVE}／${index.screens.length}`,
        'present-count',
      ),
    );
    presentBar.replaceChildren(...parts);
  };

  const render = () => {
    shell.dataset.page = page;
    const zoomed = page === 'screens' && !!current;
    shell.dataset.review = String(zoomed);
    if (!zoomed) detailsCollapsed = false;
    syncList();
    syncDetails();
    overviewTab.setAttribute(
      'aria-current',
      page === 'personas' || (page === 'screens' && !current) ? 'page' : 'false',
    );
    reviewTab.setAttribute('aria-current', page === 'screens' && current ? 'page' : 'false');
    apiTab.setAttribute('aria-current', page === 'api' ? 'page' : 'false');
    if (page === 'personas' || (page === 'screens' && !current))
      lastOverview = page === 'personas' ? 'personas' : 'screens';
    renderProgress();
    renderSidebar();
    renderPanel();
    renderPersonaBar();
    if (page === 'personas') {
      main.replaceChildren(
        personaPage(index, personaViews, {
          selected: personaId,
          status: screenState,
          // A screen opens as that persona; a screen its flow does not reach is shown with the rest of the map.
          onOpen: (screenId, id) => {
            personaId = id;
            showUnreached = !activePersona()?.depth.has(screenId);
            openScreen(screenId);
          },
        }),
      );
      mountLayoutSwitch();
      view = undefined;
      frame = undefined;
      viewer = undefined;
      simulation = undefined;
      return;
    }
    if (page === 'api') {
      const apis = apiPage(index, reviewState, {
        selected: selectedApi,
        onSelect: (id) => {
          selectedApi = id;
        },
        onCaller: (screenId, componentId) => openScreen(screenId, { component: componentId }),
        setApi: decide.api,
        setNote: note.api,
        commitNote: note.commit,
        notesOpen: apiNotesOpen,
      });
      const hint = (
        (graph.diagnostics as { code?: string; evidence?: unknown }[] | undefined) || []
      ).find((d) => d?.code === 'CONTEXT_PATH_HINT');
      if (hint) {
        const note = element(
          'p',
          `有 ${Array.isArray(hint.evidence) ? hint.evidence.length : 0} 個呼叫因為網址前綴無法確認，相關 API 可能被誤列為未被使用；請分析人員以 ./bin/screentrace config 設定 context path 後重新分析。`,
          'notice',
        );
        note.dataset.contextPathReminder = 'true';
        apis.querySelector('.api-heading')?.append(note);
      }
      main.replaceChildren(apis);
      view = undefined;
      frame = undefined;
      viewer = undefined;
      simulation = undefined;
      return;
    }
    if (listMode === 'features' && !current) {
      main.replaceChildren(
        featureMap(index, featureList, reviewState, {
          open: (id) => openScreen(id),
          setFeature: decide.feature,
          setNote: note.feature,
          commitNote: note.commit,
          notesOpen: featureNotesOpen,
          collapsed: featuresCollapsed,
          status: (id) => ({
            decision: screenState(id),
            inherited: screenInherited(graph, reviewState, id),
          }),
        }),
      );
      mountLayoutSwitch();
      view = undefined;
      frame = undefined;
      viewer = undefined;
      simulation = undefined;
      return;
    }
    // An open screen is the main body of the review: its preview between two foldable flow rails (ADR 0189).
    if (current) {
      if (!stage || stage.id !== current || !main.contains(stage.element)) {
        const id = current;
        stage = {
          id,
          ...reviewStage(index, id, {
            rails: () => rails,
            onRails: (next) => {
              rails = next;
            },
            open: (target) => openScreen(target),
            intent: prepare,
            triggers: highlightTriggers,
            status: screenState,
          }),
        };
        stage.element.append(presentBar);
        main.replaceChildren(stage.element);
        void renderFocus(id, stage.host);
      } else {
        stage.update();
        if (frame?.contentDocument) decorate(frame.contentDocument, current);
      }
      renderPresentBar();
      return;
    }
    stage = undefined;
    const canvasView = ensureCanvas();
    canvasView.update(canvasState());
    mountLayoutSwitch();
  };

  let pendingNotice: string | undefined;
  // How the shown screen was reached: by a simulated action, by the history buttons, or directly.
  let arrival: 'simulated' | 'history' | 'direct' = 'direct';
  const rememberInputs = () => {
    const doc = frame?.contentDocument;
    if (history.current && doc && current === history.current.screenId)
      history.current.inputs = snapshotInputs(doc);
  };
  const openScreen = (
    id: string,
    options: {
      component?: string;
      push?: boolean;
      notice?: string;
      refresh?: boolean;
      simulated?: boolean;
    } = {},
  ) => {
    const refreshing = options.refresh && current === id;
    arrival = options.simulated ? 'simulated' : options.push === false ? 'history' : 'direct';
    if (options.push !== false) rememberInputs();
    if (arrival === 'direct') resetJourney();
    pendingNotice = options.notice;
    if (pendingNotice && current === id && viewer) {
      const status = viewer.querySelector('.prototype-status');
      if (status) status.textContent = pendingNotice;
      pendingNotice = undefined;
    }
    if (options.push !== false) {
      if (!current || page !== 'screens') history.start(id);
      else history.visit(id, viewerScroll());
    }
    if (current !== id) buttonsOpen = false;
    highlightComponent = options.component;
    if (options.component) buttonsOpen = true;
    if (current !== id) {
      frame = undefined;
      viewer = undefined;
      simulation = undefined;
    }
    // A simulated action that lands on the same screen shows it afresh.
    if (refreshing) stage = undefined;
    page = 'screens';
    current = id;
    lastReviewed = id;
    render();
  };
  // Presenting lays the preview over the whole window, top bar and side panels included; the layout underneath stays.
  let presenting = false;
  const setPresenting = (on: boolean) => {
    presenting = on && page === 'screens' && !!current;
    document.body.dataset.presenting = String(presenting);
    const button = viewer?.querySelector<HTMLButtonElement>('.prototype-present');
    if (!button) return;
    const label = presenting ? '結束全螢幕' : '全螢幕預覽';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.setAttribute('aria-pressed', String(presenting));
    button
      .querySelector('use')
      ?.setAttribute('href', `#st-icon-${presenting ? 'minimize' : 'maximize'}`);
  };
  // Leaving a screen goes back to the overview layout it was opened from.
  const showCanvas = () => {
    setPresenting(false);
    page = lastOverview;
    current = undefined;
    highlightComponent = undefined;
    frame = undefined;
    viewer = undefined;
    simulation = undefined;
    render();
  };
  const showApi = (id?: string) => {
    setPresenting(false);
    page = 'api';
    selectedApi = id;
    current = undefined;
    render();
  };
  // The overview returns to the layout last shown; the review returns to the screen last open, or the next undecided one.
  overviewTab.onclick = () => {
    if (page === 'personas' || (page === 'screens' && !current)) return;
    setPresenting(false);
    page = lastOverview;
    current = undefined;
    highlightComponent = undefined;
    render();
  };
  reviewTab.onclick = () => {
    if (page === 'screens' && current) return;
    const id = lastReviewed || nextUndecidedId() || orderedScreens[0]?.id;
    if (id) openScreen(id);
  };
  apiTab.onclick = () => showApi();
  listButton.onclick = () => {
    listMode = 'list';
    render();
  };
  filesButton.onclick = () => {
    listMode = 'files';
    render();
  };
  featuresButton.onclick = () => {
    listMode = 'features';
    render();
  };
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  const applySearch = () => {
    renderSidebar();
    if (page === 'screens') view?.update(canvasState());
  };
  search.oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = search.value.trim();
      applySearch();
    }, 150);
  };
  clearSearch.onclick = () => {
    search.value = '';
    query = '';
    applySearch();
    search.focus();
  };

  // ---- md download / open
  download.onclick = async () => {
    download.disabled = true;
    try {
      const md = await generateMarkdown(mdPayload, reviewState),
        url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' })),
        link = element('a');
      link.href = url;
      link.download = 'screentrace-review.md';
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      exportedEdits = edits;
      lastExport = new Date();
      try {
        storage?.setItem(
          exportKey,
          JSON.stringify({ at: lastExport.toISOString(), marks: marksHash(reviewState) }),
        );
      } catch {
        /* the time is only a convenience */
      }
      renderFile();
      say(markdownSizeWarning(md) ? 'md 超過 5 MB，仍完整下載' : '已下載 md');
    } catch (error) {
      say(`下載失敗：${String(error)}`, 'error');
    } finally {
      download.disabled = false;
    }
  };
  openMd.onclick = () => {
    saveMenu.open = false;
    void openProgress();
  };
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > 64 * 1024 * 1024) throw Error('檔案超過 64 MiB 安全上限');
      applyImported(await importMarkdown(await file.text(), mdPayload));
      scheduleWrite();
      say('已開啟 md');
      render();
    } catch (error) {
      say(`開啟失敗：${String(error)}`, 'error');
    } finally {
      fileInput.value = '';
    }
  };

  // ---- keyboard
  const nextUndecidedId = () => {
    const ids = orderedScreens.map((s) => s.id),
      start = current ? ids.indexOf(current) : -1;
    for (let step = 1; step <= ids.length; step++) {
      const id = ids[(start + step + ids.length) % ids.length];
      if (screenState(id) === 'UNDECIDED') return id;
    }
    return undefined;
  };
  const nextUndecided = () => {
    const id = nextUndecidedId();
    if (id) openScreen(id);
    else say('全部畫面都已確認');
  };
  const onKey = (event: KeyboardEvent) => {
    const target = event.target as Element | null,
      editable = target?.closest?.('input,textarea,select,[contenteditable="true"]');
    if (
      event.altKey &&
      ['ArrowLeft', 'ArrowRight'].includes(event.key) &&
      page === 'screens' &&
      current
    ) {
      event.preventDefault();
      rememberInputs();
      const visit = history.move(event.key === 'ArrowLeft' ? -1 : 1, viewerScroll());
      if (visit) openScreen(visit.screenId, { push: false });
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape' && editable) {
      (target as HTMLElement).blur();
      return;
    }
    if (event.key === 'Escape') {
      if (simulation?.closeDialog()) return;
      if (presenting) {
        event.preventDefault();
        setPresenting(false);
        return;
      }
      if (page === 'screens' && current) {
        event.preventDefault();
        showCanvas();
      }
      return;
    }
    if (editable) return;
    const key = event.key.toLowerCase();
    if (key === '/') {
      event.preventDefault();
      if (page !== 'screens') {
        page = 'screens';
        render();
      }
      if (listCollapsed) {
        listCollapsed = false;
        syncList();
      }
      search.focus();
      return;
    }
    if (key === 'n' && page === 'screens') {
      event.preventDefault();
      nextUndecided();
      return;
    }
    if (key === 'f' && page === 'screens' && current) {
      event.preventDefault();
      setPresenting(!presenting);
      return;
    }
    const value = ({ k: 'KEEP', x: 'REMOVE', u: 'UNDECIDED' } as Record<string, Decision>)[key];
    if (!value || page !== 'screens' || !current) return;
    event.preventDefault();
    const row = (document.activeElement as Element | null)?.closest?.(
      '[data-component-row]',
    ) as HTMLElement | null;
    if (row) decide.component(current, row.dataset.componentRow!, value);
    else decide.screen(current, value);
  };
  document.addEventListener('keydown', onKey);
  list.addEventListener('pointerover', (event) =>
    prepare(
      (event.target as Element).closest<HTMLElement>('[data-screen-list]')?.dataset.screenList,
    ),
  );
  setTimeout(() => prepare(nextUndecidedId()), 1000);

  if (!storage) say('⚠ 無法暫存在瀏覽器，請用「交付 md」保存', 'error');
  renderFile();
  if (fileState === 'none') {
    const startEdits = edits;
    handleStore()
      .load(fileKey)
      .then(async (handle) => {
        if (!handle || fileHandle) return;
        fileHandle = handle;
        fileState = 'pending';
        renderFile();
        if (
          edits === startEdits &&
          (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'
        )
          await resume(startEdits);
        else {
          saveMenu.open = true;
        }
      })
      .catch(() => {
        /* no remembered file */
      });
  }
  render();
  root.replaceChildren(shell);
  root.dataset.ready = 'true';
} catch (error) {
  root.replaceChildren(element('p', String(error)));
  root.dataset.error = 'true';
}
