import { Graph, requireGraph } from '../contracts';
import { Library } from './library';
import { indexGraph } from '../map';
import { callSources, Caller, rootTrigger } from '../usage';
export const decisions = ['UNDECIDED', 'KEEP', 'REMOVE'] as const;
export type Decision = (typeof decisions)[number];
export type EffectiveDecision = Decision | 'INHERITED_REMOVE';
export const reasonCodes = {
  REMOVE: ['DISCONTINUED', 'REPLACED', 'DEV_ONLY', 'OTHER'],
  KEEP: ['IN_USE', 'COMPLIANCE', 'OTHER'],
} as const;
export type ReasonCode = (typeof reasonCodes.REMOVE)[number] | (typeof reasonCodes.KEEP)[number];
/** What people read for each reason code; the md shows the label with the fixed code beside it. */
export const reasonLabels: Record<'KEEP' | 'REMOVE', Record<string, string>> = {
  REMOVE: {
    DISCONTINUED: '業務單位確認已停用',
    REPLACED: '已有替代功能',
    DEV_ONLY: '僅開發或測試用',
    OTHER: '其他',
  },
  KEEP: { IN_USE: '仍在使用', COMPLIANCE: '法規或稽核需要', OTHER: '其他' },
};
export interface DecisionNote {
  reason?: ReasonCode;
  note?: string;
}
export interface DecisionNotes {
  screens: Record<string, DecisionNote>;
  components: Record<string, Record<string, DecisionNote>>;
  /** Notes on APIs (endpoint ID); absent in states saved before APIs could be marked. */
  apis?: Record<string, DecisionNote>;
}
/** Input fields and tables: markable like buttons, grouped and counted on their own. */
export const fieldKinds = [
  'TEXT_INPUT',
  'TEXTAREA',
  'SELECT',
  'MULTI_SELECT',
  'CHECKBOX',
  'RADIO',
  'DATE_PICKER',
  'FILE_INPUT',
  'TABLE',
] as const;
/** WP8 reuses this versioned, framework-neutral browser/Node contract. */
export interface ReviewState {
  format: 'screentrace-review';
  version: 1;
  schemaVersion: '2.2';
  application: string;
  fingerprint: string;
  screenDecisions: Record<string, Decision>;
  componentDecisions: Record<string, Record<string, Decision>>;
  decisionNotes?: DecisionNotes;
  /** Decisions made on an API itself (endpoint ID), shown beside the status derived from its callers. */
  apiDecisions?: Record<string, Decision>;
  manifest_sha256?: string;
  component_overrides?: Record<string, Record<string, string>>;
  orphan_component_overrides?: OverrideRecord[];
}
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
export function emptyReview(graph: Graph, fingerprint: string): ReviewState {
  requireGraph(graph);
  return {
    format: 'screentrace-review',
    version: 1,
    schemaVersion: '2.2',
    application: graph.application.name,
    fingerprint,
    screenDecisions: {},
    componentDecisions: {},
    decisionNotes: { screens: {}, components: {} },
  };
}
export function screenDecision(state: ReviewState, id: string): Decision {
  return own(state.screenDecisions, id) ? state.screenDecisions[id] : 'UNDECIDED';
}
export function componentDecision(state: ReviewState, screen: string, component: string): Decision {
  const values = own(state.componentDecisions, screen) ? state.componentDecisions[screen] : {};
  return own(values, component) ? values[component] : 'UNDECIDED';
}
export function apiDecision(state: ReviewState, id: string): Decision {
  const values = state.apiDecisions || {};
  return own(values, id) ? values[id] : 'UNDECIDED';
}
function requireDecision(value: unknown): asserts value is Decision {
  if (!decisions.includes(value as Decision)) throw Error('無效確認狀態');
}
const notesOf = (state: ReviewState): DecisionNotes =>
  state.decisionNotes || { screens: {}, components: {} };
/** The note kept for one screen, component or API; an empty object when there is none. */
export function decisionNoteOf(
  state: ReviewState,
  scope: 'screen' | 'component' | 'api',
  id: string,
  componentId?: string,
): DecisionNote {
  const notes = notesOf(state),
    values =
      scope === 'screen'
        ? notes.screens
        : scope === 'api'
          ? notes.apis || {}
          : own(notes.components, id)
            ? notes.components[id]
            : {},
    key = scope === 'component' ? componentId! : id;
  return own(values, key) ? values[key] : {};
}
const validReason = (decision: Decision, reason: unknown) =>
  decision === 'UNDECIDED' ||
  (reasonCodes[decision] as readonly string[]).includes(reason as string);
function sanitizeDecisionNote(input: DecisionNote): DecisionNote {
  if (
    !input ||
    typeof input !== 'object' ||
    Object.keys(input).some((key) => !['reason', 'note'].includes(key))
  )
    throw Error('決策原因／備註格式錯誤');
  const result: DecisionNote = {};
  if (input.reason !== undefined) {
    if (![...reasonCodes.KEEP, ...reasonCodes.REMOVE].includes(input.reason as never))
      throw Error('無效決策原因');
    result.reason = input.reason;
  }
  if (input.note !== undefined) {
    if (typeof input.note !== 'string') throw Error('備註必須是文字');
    // Line breaks become spaces so words stay apart; other control and direction characters are dropped.
    const note = input.note
      .replace(/[\r\n\t\u2028\u2029]+/g, ' ')
      .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, '');
    if (Array.from(note).length > 1000) throw Error('備註不可超過 1,000 個字元');
    if (note) result.note = note;
  }
  return result;
}
const putNote = (notes: Record<string, DecisionNote>, id: string, note: DecisionNote) => {
  const next = { ...notes };
  if (note.reason === undefined && note.note === undefined) delete next[id];
  // A defined own property keeps an ID such as __proto__ an ordinary entry.
  else
    Object.defineProperty(next, id, {
      value: note,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  return next;
};
export function setDecisionNote(
  state: ReviewState,
  scope: 'screen',
  screenId: string,
  note: DecisionNote,
): ReviewState;
export function setDecisionNote(
  state: ReviewState,
  scope: 'component',
  screenId: string,
  componentId: string,
  note: DecisionNote,
): ReviewState;
export function setDecisionNote(
  state: ReviewState,
  scope: 'api',
  apiId: string,
  note: DecisionNote,
): ReviewState;
export function setDecisionNote(
  state: ReviewState,
  scope: 'screen' | 'component' | 'api',
  screenId: string,
  componentOrNote: string | DecisionNote,
  noteArg?: DecisionNote,
): ReviewState {
  const notes = notesOf(state),
    component = scope === 'component' ? (componentOrNote as string) : undefined,
    input = (scope === 'component' ? noteArg : componentOrNote) as DecisionNote,
    clean = sanitizeDecisionNote(input),
    decision =
      scope === 'screen'
        ? screenDecision(state, screenId)
        : scope === 'api'
          ? apiDecision(state, screenId)
          : componentDecision(state, screenId, component!);
  if (clean.reason !== undefined && !validReason(decision, clean.reason))
    throw Error('決策原因與目前決策不相符');
  if (scope === 'api')
    return {
      ...state,
      decisionNotes: { ...notes, apis: putNote(notes.apis || {}, screenId, clean) },
    };
  if (scope === 'screen')
    return {
      ...state,
      decisionNotes: { ...notes, screens: putNote(notes.screens, screenId, clean) },
    };
  const byScreen = own(notes.components, screenId) ? notes.components[screenId] : {};
  return {
    ...state,
    decisionNotes: {
      ...notes,
      components: { ...notes.components, [screenId]: putNote(byScreen, component!, clean) },
    },
  };
}
function clearIncompatibleReason(
  state: ReviewState,
  scope: 'screen' | 'component' | 'api',
  screenId: string,
  componentId?: string,
  decision?: Decision,
): ReviewState {
  if (!decision || decision === 'UNDECIDED') return state;
  const notes = notesOf(state),
    byScreen = own(notes.components, screenId) ? notes.components[screenId] : {},
    old = decisionNoteOf(state, scope, screenId, componentId);
  if (!old.reason || validReason(decision, old.reason)) return state;
  const cleaned = { ...old };
  delete cleaned.reason;
  if (scope === 'api')
    return {
      ...state,
      decisionNotes: { ...notes, apis: putNote(notes.apis || {}, screenId, cleaned) },
    };
  if (scope === 'screen')
    return {
      ...state,
      decisionNotes: { ...notes, screens: putNote(notes.screens, screenId, cleaned) },
    };
  return {
    ...state,
    decisionNotes: {
      ...notes,
      components: { ...notes.components, [screenId]: putNote(byScreen, componentId!, cleaned) },
    },
  };
}
export function setScreen(state: ReviewState, id: string, decision: Decision): ReviewState {
  requireDecision(decision);
  return clearIncompatibleReason(
    {
      ...state,
      screenDecisions: { ...state.screenDecisions, [id]: decision },
      decisionNotes: notesOf(state),
    },
    'screen',
    id,
    undefined,
    decision,
  );
}
export function setComponent(
  state: ReviewState,
  screen: string,
  component: string,
  decision: Decision,
): ReviewState {
  requireDecision(decision);
  const current = own(state.componentDecisions, screen) ? state.componentDecisions[screen] : {};
  return clearIncompatibleReason(
    {
      ...state,
      componentDecisions: {
        ...state.componentDecisions,
        [screen]: { ...current, [component]: decision },
      },
      decisionNotes: notesOf(state),
    },
    'component',
    screen,
    component,
    decision,
  );
}
export function setApi(state: ReviewState, id: string, decision: Decision): ReviewState {
  requireDecision(decision);
  return clearIncompatibleReason(
    {
      ...state,
      apiDecisions: { ...(state.apiDecisions || {}), [id]: decision },
      decisionNotes: notesOf(state),
    },
    'api',
    id,
    undefined,
    decision,
  );
}
/** Notes as they leave the page (md): a reason only stays with a KEEP／REMOVE decision it fits,
 * and an entry left with neither reason nor note is dropped. Unknown IDs are kept, as decisions are. */
export function exportableNotes(state: ReviewState): Required<DecisionNotes> {
  const notes = notesOf(state),
    keep = (note: DecisionNote, decision: Decision): DecisionNote | undefined => {
      const result: DecisionNote = {};
      if (
        note.reason !== undefined &&
        decision !== 'UNDECIDED' &&
        validReason(decision, note.reason)
      )
        result.reason = note.reason;
      if (note.note) result.note = note.note;
      return result.reason !== undefined || result.note !== undefined ? result : undefined;
    },
    screens: Record<string, DecisionNote> = {},
    components: Record<string, Record<string, DecisionNote>> = {},
    apis: Record<string, DecisionNote> = {};
  // IDs are data: defining own properties keeps a key such as __proto__ an ordinary entry.
  const put = <T>(target: Record<string, T>, key: string, value: T) =>
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  for (const [id, note] of Object.entries(notes.screens)) {
    const value = keep(note, screenDecision(state, id));
    if (value) put(screens, id, value);
  }
  for (const [screenId, values] of Object.entries(notes.components))
    for (const [componentId, note] of Object.entries(values)) {
      const value = keep(note, componentDecision(state, screenId, componentId));
      if (!value) continue;
      if (!own(components, screenId)) put(components, screenId, {});
      put(components[screenId], componentId, value);
    }
  for (const [id, note] of Object.entries(notes.apis || {})) {
    const value = keep(note, apiDecision(state, id));
    if (value) put(apis, id, value);
  }
  return { screens, components, apis };
}
/** Applies the existing per-screen/component decision to each selected key. */
export function effectiveComponent(
  state: ReviewState,
  screen: string,
  component: string,
): EffectiveDecision {
  return screenDecision(state, screen) === 'REMOVE'
    ? 'INHERITED_REMOVE'
    : componentDecision(state, screen, component);
}
/** Screen, then component, in code-unit order (stable across locales). */
const byComponentKey = (
  a: { screenId: string; componentId: string },
  b: { screenId: string; componentId: string },
) =>
  a.screenId < b.screenId
    ? -1
    : a.screenId > b.screenId
      ? 1
      : a.componentId < b.componentId
        ? -1
        : a.componentId > b.componentId
          ? 1
          : 0;
type ComponentKey = { screenId: string; componentId: string };
export function buttonComponents(graph: Graph): ComponentKey[] {
  return buttonsOf(indexGraph(graph));
}
function buttonsOf(index: ReturnType<typeof indexGraph>): ComponentKey[] {
  const result: ComponentKey[] = [];
  for (const [componentId, owners] of index.owners) {
    const attributes = index.nodes.get(componentId)?.attributes || {},
      kind = String(attributes.kind || '').toUpperCase(),
      tag = String(attributes.tag || '').toLowerCase(),
      type = String(attributes.type || attributes.inputType || '').toLowerCase();
    if (
      ['BUTTON', 'LINK', 'SUBMIT'].includes(kind) ||
      tag === 'a' ||
      ['button', 'html:button', 'html:submit', 'html:cancel', 'html:image'].includes(tag) ||
      (tag === 'input' && ['button', 'submit', 'image'].includes(type))
    )
      for (const screenId of owners) result.push({ screenId, componentId });
  }
  return result.sort(byComponentKey);
}
/** Input fields and tables (by component kind) that are not already counted as buttons. */
export function fieldComponents(graph: Graph): ComponentKey[] {
  const index = indexGraph(graph);
  return fieldsOf(index, buttonsOf(index));
}
function fieldsOf(
  index: ReturnType<typeof indexGraph>,
  buttonKeys: ComponentKey[],
): ComponentKey[] {
  const buttons = new Set(buttonKeys.map((k) => k.componentId)),
    result: ComponentKey[] = [];
  for (const [componentId, owners] of index.owners) {
    const kind = String(index.nodes.get(componentId)?.attributes.kind || '').toUpperCase();
    if (!buttons.has(componentId) && (fieldKinds as readonly string[]).includes(kind))
      for (const screenId of owners) result.push({ screenId, componentId });
  }
  return result.sort(byComponentKey);
}
export function markableComponents(graph: Graph): { screenId: string; componentId: string }[] {
  const index = indexGraph(graph),
    triggers = new Set((graph.behaviors || []).map((b) => rootTrigger(index, b)).filter(Boolean));
  for (const edge of graph.relationships || [])
    if (['CALLS', 'TRIGGERS', 'NAVIGATES_TO'].includes(edge.type)) triggers.add(edge.from);
  const result = new Map<string, ComponentKey>(),
    buttons = buttonsOf(index);
  for (const key of [...buttons, ...fieldsOf(index, buttons)])
    result.set(JSON.stringify([key.screenId, key.componentId]), key);
  for (const [componentId, owners] of index.owners)
    if (triggers.has(componentId))
      for (const screenId of owners)
        result.set(JSON.stringify([screenId, componentId]), { screenId, componentId });
  return [...result.values()].sort(byComponentKey);
}
export function statistics(graph: Graph, state: ReviewState) {
  const screens = { UNDECIDED: 0, KEEP: 0, REMOVE: 0 },
    components = { UNDECIDED: 0, KEEP: 0, REMOVE: 0 },
    fields = { UNDECIDED: 0, KEEP: 0, REMOVE: 0 },
    apis = { UNDECIDED: 0, KEEP: 0, REMOVE: 0 };
  let inherited = 0,
    fieldsInherited = 0;
  for (const n of requireGraph(graph).nodes)
    if (n.type === 'SCREEN') screens[screenDecision(state, n.id)]++;
    else if (n.type === 'ENDPOINT') apis[apiDecision(state, n.id)]++;
  // One index for both groups: statistics runs on every render of a large report.
  const index = indexGraph(graph),
    buttons = buttonsOf(index);
  for (const key of buttons) {
    components[componentDecision(state, key.screenId, key.componentId)]++;
    if (screenDecision(state, key.screenId) === 'REMOVE') inherited++;
  }
  for (const key of fieldsOf(index, buttons)) {
    fields[componentDecision(state, key.screenId, key.componentId)]++;
    if (screenDecision(state, key.screenId) === 'REMOVE') fieldsInherited++;
  }
  return { screens, components, inherited, fields, fieldsInherited, apis };
}
export function conflicts(
  graph: Graph,
  state: ReviewState,
): { screenId: string; componentId: string; targetScreenId: string }[] {
  const index = indexGraph(graph),
    result: { screenId: string; componentId: string; targetScreenId: string }[] = [];
  for (const r of index.relations)
    if (screenDecision(state, r.to) === 'REMOVE')
      for (const component of r.triggers)
        if (componentDecision(state, r.from, component) === 'KEEP')
          result.push({ screenId: r.from, componentId: component, targetScreenId: r.to });
  return result;
}
export interface Usage {
  status: 'IN_USE' | 'REMOVABLE' | 'UNREFERENCED';
  callers: Caller[];
}
export function deriveApiUsage(graph: Graph, state: ReviewState): Map<string, Usage> {
  const result = new Map<string, Usage>();
  for (const [id, callers] of callSources(graph)) {
    const removed =
      callers.length > 0 &&
      callers.every(
        (c) =>
          screenDecision(state, c.screenId) === 'REMOVE' ||
          (!!c.componentId && componentDecision(state, c.screenId, c.componentId) === 'REMOVE'),
      );
    result.set(id, {
      status: !callers.length ? 'UNREFERENCED' : removed ? 'REMOVABLE' : 'IN_USE',
      callers,
    });
  }
  return result;
}
/** An API decided directly whose callers say otherwise: kept although every caller is removed,
 * or removed although a caller is not. Listed for people to settle; nothing is corrected. */
export function apiConflicts(
  graph: Graph,
  state: ReviewState,
): { apiId: string; decision: 'KEEP' | 'REMOVE'; derived: Usage['status'] }[] {
  const result: { apiId: string; decision: 'KEEP' | 'REMOVE'; derived: Usage['status'] }[] = [];
  // Deriving every API's callers is costly on a large report; without a direct mark there is nothing to compare.
  if (!Object.values(state.apiDecisions || {}).some((d) => d !== 'UNDECIDED')) return result;
  for (const [apiId, usage] of deriveApiUsage(graph, state)) {
    const decision = apiDecision(state, apiId);
    if (
      (decision === 'KEEP' && usage.status === 'REMOVABLE') ||
      (decision === 'REMOVE' && usage.status === 'IN_USE')
    )
      result.push({ apiId, decision, derived: usage.status });
  }
  return result.sort((a, b) => (a.apiId < b.apiId ? -1 : a.apiId > b.apiId ? 1 : 0));
}
export function validateReview(
  value: unknown,
  graph: Graph,
  fingerprint: string,
  library?: Library,
): ReviewState {
  requireGraph(graph);
  if (!value || typeof value !== 'object') throw Error('無效 review 資料');
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== '2.2') throw Error('Review 只接受 schema 2.2');
  if (
    data.format !== 'screentrace-review' ||
    data.version !== 1 ||
    data.application !== graph.application.name ||
    data.fingerprint !== fingerprint
  )
    throw Error('Review 版本／應用／分析指紋不符');
  let result = emptyReview(graph, fingerprint);
  const dictionary = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Review 決策必須為字典');
    return v as Record<string, unknown>;
  };
  for (const [id, decision] of Object.entries(dictionary(data.screenDecisions))) {
    requireDecision(decision);
    result = setScreen(result, id, decision);
  }
  for (const [screen, components] of Object.entries(dictionary(data.componentDecisions)))
    for (const [component, decision] of Object.entries(dictionary(components))) {
      requireDecision(decision);
      result = setComponent(result, screen, component, decision);
    }
  if (data.apiDecisions !== undefined)
    for (const [id, decision] of Object.entries(dictionary(data.apiDecisions))) {
      requireDecision(decision);
      result = setApi(result, id, decision);
    }
  if (data.decisionNotes !== undefined) {
    const value = dictionary(data.decisionNotes),
      keys = Object.keys(value).sort().join(',');
    if (keys !== 'components,screens' && keys !== 'apis,components,screens')
      throw Error('decisionNotes 欄位錯誤');
    for (const [screen, note] of Object.entries(dictionary(value.screens)))
      result = setDecisionNote(result, 'screen', screen, note as DecisionNote);
    for (const [screen, components] of Object.entries(dictionary(value.components)))
      for (const [component, note] of Object.entries(dictionary(components)))
        result = setDecisionNote(result, 'component', screen, component, note as DecisionNote);
    if (value.apis !== undefined)
      for (const [api, note] of Object.entries(dictionary(value.apis)))
        result = setDecisionNote(result, 'api', api, note as DecisionNote);
  }
  if (
    data.component_overrides !== undefined ||
    data.orphan_component_overrides !== undefined ||
    data.manifest_sha256 !== undefined
  ) {
    result = {
      ...result,
      manifest_sha256: data.manifest_sha256 as string,
      component_overrides: data.component_overrides as Record<string, Record<string, string>>,
      orphan_component_overrides: data.orphan_component_overrides as OverrideRecord[],
    };
  }
  return partitionOverrides(result, graph, library);
}
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const baseKey = (state: ReviewState) =>
  `screentrace:review:v1:${encodeURIComponent(state.application)}:${state.fingerprint}`;
export function storageKey(state: ReviewState): string {
  return baseKey(state) + (state.manifest_sha256 ? ':' + state.manifest_sha256 : '');
}
export function loadReview(
  storage: StorageLike | undefined,
  graph: Graph,
  fingerprint: string,
  library?: Library,
): { state: ReviewState; warning?: string } {
  const empty = partitionOverrides(emptyReview(graph, fingerprint), graph, library);
  try {
    if (!storage) throw Error();
    const saved =
      storage.getItem(baseKey(empty) + ':library-transfer') ||
      storage.getItem(storageKey(empty)) ||
      storage.getItem(baseKey(empty));
    const state = saved ? validateReview(JSON.parse(saved), graph, fingerprint, library) : empty;
    return {
      state,
      ...(Object.keys(state.screenDecisions).some((id) =>
        graph.nodes.some((n) => n.type === 'SCREEN' && n.attributes.supersedesScreenId === id),
      )
        ? { warning: '此網址已依身分拆分，請重新標記' }
        : (state.orphan_component_overrides || []).length
          ? { warning: '覆寫的來源元件庫或圖 ID 與目前不同，未套用；已保留 orphan' }
          : {}),
    };
  } catch {
    return { state: empty, warning: '暫存不可用或資料不符；仍可使用確認模式' };
  }
}
export function saveReview(
  storage: StorageLike | undefined,
  state: ReviewState,
): string | undefined {
  try {
    if (!storage) throw Error();
    const encoded = JSON.stringify(state);
    storage.setItem(storageKey(state), encoded);
    const transfer = baseKey(state) + ':library-transfer';
    // loadReview reads the transfer key first, so an existing one must follow every later save;
    // otherwise a snapshot from an earlier library session would replace newer decisions.
    if (
      state.manifest_sha256 ||
      state.orphan_component_overrides?.length ||
      storage.getItem(transfer) !== null
    )
      storage.setItem(transfer, encoded);
  } catch {
    return '暫存失敗；目前決策仍保留在此頁面';
  }
}
export interface OverrideRecord {
  screenId: string;
  componentId: string;
  libraryComponentId: string;
  manifest_sha256: string;
}
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const dict = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('覆寫必須為字典');
  return value as Record<string, unknown>;
};
export function overrideRecords(state: ReviewState): OverrideRecord[] {
  const records: OverrideRecord[] = [];
  if (state.manifest_sha256 !== undefined && !hash(state.manifest_sha256))
    throw Error('manifest_sha256 格式錯誤');
  if (state.component_overrides !== undefined)
    for (const [screenId, components] of Object.entries(dict(state.component_overrides)))
      for (const [componentId, id] of Object.entries(dict(components))) {
        if (typeof id !== 'string' || !id || !hash(state.manifest_sha256))
          throw Error('覆寫 ID／manifest_sha256 格式錯誤');
        records.push({
          screenId,
          componentId,
          libraryComponentId: id,
          manifest_sha256: state.manifest_sha256,
        });
      }
  if (state.orphan_component_overrides !== undefined) {
    if (!Array.isArray(state.orphan_component_overrides))
      throw Error('orphan_component_overrides 必須為陣列');
    for (const record of state.orphan_component_overrides) {
      if (
        !record ||
        typeof record !== 'object' ||
        Object.keys(record).sort().join(',') !==
          ['componentId', 'libraryComponentId', 'manifest_sha256', 'screenId'].join(',') ||
        !hash(record.manifest_sha256) ||
        [record.screenId, record.componentId, record.libraryComponentId].some(
          (v) => typeof v !== 'string' || !v,
        )
      )
        throw Error('orphan 覆寫欄位／manifest_sha256 格式錯誤');
      records.push({ ...record });
    }
  }
  const unique = new Map<string, OverrideRecord>();
  for (const record of records) {
    const key = JSON.stringify([record.screenId, record.componentId, record.manifest_sha256]);
    const old = unique.get(key);
    if (old && old.libraryComponentId !== record.libraryComponentId) throw Error('同來源覆寫衝突');
    unique.set(key, record);
  }
  return [...unique.values()].sort((a, b) => {
    const x = JSON.stringify([a.screenId, a.componentId, a.manifest_sha256, a.libraryComponentId]),
      y = JSON.stringify([b.screenId, b.componentId, b.manifest_sha256, b.libraryComponentId]);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
/** One reversible partition boundary shared by localStorage and Markdown. */
export function partitionOverrides(
  state: ReviewState,
  graph: Graph,
  library?: Library,
): ReviewState {
  const records = overrideRecords(state),
    index = indexGraph(graph),
    ids = new Set(library?.manifest.components.map((c) => c.id) || []),
    active: Record<string, Record<string, string>> = Object.create(null),
    orphans: OverrideRecord[] = [];
  if (library && !hash(library.sha256)) throw Error('manifest_sha256 格式錯誤');
  for (const record of records)
    if (
      record.manifest_sha256 === library?.sha256 &&
      ids.has(record.libraryComponentId) &&
      index.nodes.get(record.screenId)?.type === 'SCREEN' &&
      index.owners.get(record.componentId)?.includes(record.screenId)
    ) {
      if (!own(active, record.screenId)) active[record.screenId] = Object.create(null);
      active[record.screenId][record.componentId] = record.libraryComponentId;
    } else orphans.push(record);
  const { manifest_sha256, component_overrides, orphan_component_overrides, ...base } = state;
  return {
    ...base,
    ...(library ? { manifest_sha256: library.sha256 } : {}),
    ...(Object.keys(active).length ? { component_overrides: active } : {}),
    ...(orphans.length ? { orphan_component_overrides: orphans } : {}),
  };
}
export function setOverride(
  state: ReviewState,
  graph: Graph,
  library: Library,
  screenId: string,
  componentId: string,
  id: string,
): ReviewState {
  if (screenDecision(state, screenId) !== 'KEEP') throw Error('只能覆寫 KEEP 畫面元件');
  const normalized = partitionOverrides(state, graph, library);
  if (!indexGraph(graph).owners.get(componentId)?.includes(screenId))
    throw Error('畫面元件 ID 無對應');
  if (id && !library.manifest.components.some((c) => c.id === id)) throw Error('元件庫 ID 無對應');
  const records = overrideRecords(normalized).filter(
    (r) =>
      !(
        r.screenId === screenId &&
        r.componentId === componentId &&
        r.manifest_sha256 === library.sha256
      ),
  );
  if (id)
    records.push({
      screenId,
      componentId,
      libraryComponentId: id,
      manifest_sha256: library.sha256,
    });
  return partitionOverrides(
    { ...normalized, component_overrides: undefined, orphan_component_overrides: records },
    graph,
    library,
  );
}
export function effectiveOverride(
  state: ReviewState,
  screenId: string,
  componentId: string,
): string | undefined {
  const values = state.component_overrides;
  if (
    screenDecision(state, screenId) !== 'KEEP' ||
    !values ||
    !own(values, screenId) ||
    !own(values[screenId], componentId)
  )
    return undefined;
  return values[screenId][componentId];
}
