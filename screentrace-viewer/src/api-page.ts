import { endpointGroup, endpointMethod, endpointPath } from './endpoint-presentation';
import {
  deriveApiUsage,
  screenDecision,
  componentDecision,
  apiDecision,
  decisionNoteOf,
  Decision,
  DecisionNote,
  ReviewState,
} from './shared/review';
import { decisionSwitch, decisionLabel, noteEditor } from './review-ui';
import { componentLabelsForScreen, kindNames } from './labels';
import { callerKind, Caller } from './usage';
import { Index } from './map';
import { Node, Evidence } from './contracts';
import { element } from './text';
import { proportionBar, sharePercent } from './proportion';
import { splitter, SplitRange } from './splitter';
import { backgroundJobs, jobTriggerLabels, BackgroundJob } from './shared/jobs';
import { backendCalls } from './shared/review-md';
import { stateChanges, stateLabel, stateTypes, StateType } from './shared/states';

/** The three statuses shown to people: inferred usage and system entry points both count as in use. */
export type ApiStatus = 'IN_USE' | 'UNREFERENCED' | 'REMOVABLE';
export const apiStatusLabels: Record<ApiStatus, string> = {
  IN_USE: '使用中',
  UNREFERENCED: '未被使用',
  REMOVABLE: '可移除',
};
const systemEntry = (node: Node, index: Index): string | undefined => {
  const path = endpointPath(node);
  if (node.attributes.inheritedTemplate === 'true') return '被繼承的設定樣板';
  if (String(node.attributes.entrySource || '').includes('welcome-file')) return '系統預設首頁';
  if (
    index.screens.some(
      (screen) =>
        !!screen.attributes.autoRedirect && (index.routes.get(screen.id) || []).includes(path),
    )
  )
    return '系統自動導向';
  return undefined;
};

/** Endpoints listed on the API page: backend APIs, not screen URLs and not unmatched frontend request descriptions. */
export function apiEndpoints(index: Index): Node[] {
  return index.graph.nodes.filter(
    (n) =>
      n.type === 'ENDPOINT' &&
      n.attributes.origin !== 'javascript-request' &&
      endpointGroup(n, index) !== 'SCREEN',
  );
}

export function apiStatuses(index: Index, state: ReviewState): Map<string, ApiStatus> {
  const usage = deriveApiUsage(index.graph, state),
    result = new Map<string, ApiStatus>();
  for (const node of apiEndpoints(index)) {
    const status = usage.get(node.id)!.status;
    result.set(node.id, systemEntry(node, index) && status === 'UNREFERENCED' ? 'IN_USE' : status);
  }
  return result;
}

/** A note is not a caller or a fourth API status. Only the adapter's paired structured proof qualifies. */
export function externalCallEvidence(node: Node): Evidence[] {
  if (node.attributes.externalCall !== 'webhook') return [];
  const proofs = (node.evidence || []).filter((item): item is Evidence => {
    if (!item || typeof item !== 'object') return false;
    const e = item as Evidence;
    if (
      e.parser !== 'SpringSecurityExternalCall' ||
      !['INFERRED', 'CONFIRMED'].includes(e.resolution) ||
      !e.source?.file
    )
      return false;
    try {
      const value = JSON.parse(e.detail || 'null');
      return (
        ['permitAll', 'ignoringRequestMatchers'].includes(value?.kind) &&
        typeof value.pattern === 'string'
      );
    } catch {
      return false;
    }
  });
  return ['permitAll', 'ignoringRequestMatchers'].every((kind) =>
    proofs.some((e) => JSON.parse(e.detail!).kind === kind),
  )
    ? proofs
    : [];
}

const STATUS_ORDER: ApiStatus[] = ['IN_USE', 'UNREFERENCED', 'REMOVABLE'];
/** How many APIs have each status, in the order the page shows them. */
export function apiStatusCounts(statuses: Iterable<ApiStatus>): Record<ApiStatus, number> {
  const counts: Record<ApiStatus, number> = { IN_USE: 0, UNREFERENCED: 0, REMOVABLE: 0 };
  for (const status of statuses) counts[status]++;
  return counts;
}
const statusShares = (counts: Record<ApiStatus, number>) =>
  STATUS_ORDER.map((key) => ({ key, count: counts[key] }));
const statusCountsLabel = (counts: Record<ApiStatus, number>) =>
  STATUS_ORDER.map((key) => `${apiStatusLabels[key]} ${counts[key]}`).join('、');

/** How a caller triggers the API, in plain words: its component's label, or a load call on the screen. */
export function callerLabel(index: Index, caller: Caller): string {
  return caller.componentId
    ? componentLabelsForScreen(index, caller.screenId).get(caller.componentId) || '沒有文字的按鈕'
    : callerKind(index, caller) === 'unresolved'
      ? '無法確定的觸發來源'
      : '畫面載入時';
}
/**
 * What an API is for, in plain words, from its callers only (ADR 0165): the buttons that call it,
 * the screens that call it when they open, or an outside system. Undefined when nothing calls it.
 */
export function apiPurpose(
  index: Index,
  callers: Caller[],
  external = false,
): { short: string; sentence: string } | undefined {
  const buttons = new Map<string, Set<string>>(),
    loads = new Set<string>();
  for (const caller of callers) {
    const label = callerLabel(index, caller);
    if (!caller.componentId) {
      if (label === '畫面載入時') loads.add(caller.screenId);
      continue;
    }
    if (label === '沒有文字的按鈕') continue;
    // The label without the kind word or the occurrence number the panel adds.
    const kind = kindNames[index.nodes.get(caller.componentId)?.attributes.kind || ''];
    let text = label.replace(/（第 \d+ 個）$/, '');
    if (kind && text.endsWith(` ${kind}`)) text = text.slice(0, -kind.length - 1);
    // `busy ? '送出中…' : '送出'` reads as both; the in-progress wording is left out.
    const options = text.split(' / ').filter((o) => !/(…|\.\.\.)$/.test(o.trim()));
    text = (options.length ? options : text.split(' / ')).join(' / ');
    if (!text || text.includes('示例值') || /^<.*>$/.test(text)) continue;
    buttons.set(text, new Set([...(buttons.get(text) || []), caller.screenId]));
  }
  const labels = [...buttons]
    .sort((a, b) => b[1].size - a[1].size || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([text]) => text);
  const name = (id: string) => index.nodes.get(id)?.name || '畫面';
  const opened = [...loads].sort((a, b) => name(a).localeCompare(name(b), 'zh-Hant'));
  const parts: string[] = [];
  if (labels.length)
    parts.push(
      `按下${labels
        .slice(0, 3)
        .map((l) => `「${l}」`)
        .join('、')}${labels.length > 3 ? ` 等 ${labels.length} 個按鈕` : ''}時呼叫`,
    );
  if (opened.length)
    parts.push(
      `開啟「${name(opened[0])}」${opened.length > 1 ? ` 等 ${opened.length} 個畫面` : ''}時自動呼叫`,
    );
  if (external) parts.push('由外部系統（Webhook）呼叫');
  if (!parts.length) return undefined;
  const short = [
    ...labels.slice(0, 2),
    ...(opened.length && labels.length < 2 ? ['畫面載入時'] : []),
    ...(external ? ['外部系統'] : []),
  ].join('、');
  return { short, sentence: parts.join('；') + '。' };
}
export interface ChainScreen {
  screenId: string;
  triggers: string[];
}
/** The screens at the start of an API's call chain, each with what on it triggers the API, by screen name. */
export function chainScreens(index: Index, callers: Caller[]): ChainScreen[] {
  const byScreen = new Map<string, string[]>();
  for (const caller of callers) {
    const list =
      byScreen.get(caller.screenId) || byScreen.set(caller.screenId, []).get(caller.screenId)!;
    const label = callerLabel(index, caller);
    if (!list.includes(label)) list.push(label);
  }
  const name = (id: string) => index.nodes.get(id)?.name || '畫面';
  return [...byScreen]
    .map(([screenId, triggers]) => ({ screenId, triggers }))
    .sort(
      (a, b) =>
        name(a.screenId).localeCompare(name(b.screenId), 'zh-Hant') ||
        (a.screenId < b.screenId ? -1 : a.screenId > b.screenId ? 1 : 0),
    );
}
/** The chain shows this many screens and handlers; the rest are counted, and listed in the sections below. */
export const CHAIN_LIMIT = 5;

export interface ApiPageOptions {
  selected?: string;
  onSelect?: (id: string) => void;
  onCaller: (screenId: string, componentId?: string) => void;
  /** Marking an API directly; without it the page only reads. */
  setApi?: (id: string, value: Decision) => void;
  setNote?: (id: string, note: DecisionNote) => void;
  commitNote?: () => void;
  /** APIs whose note editor is open, so a rebuilt page keeps it open. */
  notesOpen?: Set<string>;
}
type Filter = 'ALL' | 'ATTENTION' | 'IN_USE';
type Grouping = 'controller' | 'url';
interface ApiRecord {
  node: Node;
  method: string;
  path: string;
  handlers: Node[];
  callers: Caller[];
  screens: number;
  status: ApiStatus;
  note?: string;
  external: Evidence[];
  searchable: string;
  controller: string;
  prefix: string;
}

/** A component calling from this many screens is a shared one (a header, a layout), listed once instead of per screen. */
const SHARED_SCREENS = 3;
const NO_HANDLER = '找不到處理程式';
/** What the page keeps while the report is open: leaving for a screen and coming back finds the list as it was. */
const memory = {
  filter: 'ALL' as Filter,
  grouping: 'controller' as Grouping,
  query: '',
  collapsed: new Set<string>(),
  split: undefined as number | undefined,
};
/** The API list's share of the page width: 30% at first, between 20% and 50%, and never narrower than 280px (CSS). */
export const API_SPLIT: SplitRange = { initial: 30, min: 20, max: 50 };

const controllerOf = (handlers: Node[]) => {
  const handler = handlers
    .map((h) => h.attributes.class || h.name.split('.')[0])
    .filter(Boolean)
    .sort()[0];
  return handler || NO_HANDLER;
};
/** The URL area: `/api/v1/auth/login` → `/api/v1/auth`; a bare `api` or version segment is not an area of its own. */
export function urlPrefix(path: string): string {
  const parts = path.split('/').filter(Boolean),
    kept: string[] = [];
  for (const part of parts) {
    kept.push(part);
    if (part !== 'api' && !/^v\d+$/.test(part)) break;
  }
  return '/' + kept.join('/');
}
export interface PathPart {
  text: string;
  param: boolean;
}
/** A path split into its fixed text and its `{name}` parameters, in order; joined back they are the path. */
export function pathParts(path: string): PathPart[] {
  return path
    .split(/(\{[^{}/]+\})/)
    .filter(Boolean)
    .map((text) => ({ text, param: /^\{[^{}/]+\}$/.test(text) }));
}
/** A path as code with each parameter marked, so the fixed parts and the values a caller fills in read apart. */
export function pathCode(path: string, className: string): HTMLElement {
  const code = element('code', undefined, className);
  for (const part of pathParts(path))
    code.append(
      part.param
        ? element('span', part.text, 'api-path-param')
        : document.createTextNode(part.text),
    );
  return code;
}
/** How many screens call this API next to the API with the most callers, as a short bar beside the count. */
const callerBar = (screens: number, most: number) => {
  const bar = element('span', undefined, 'api-caller-bar');
  bar.setAttribute('aria-hidden', 'true');
  const width = sharePercent(screens, most);
  if (width) {
    const fill = element('span', undefined, 'api-caller-fill');
    fill.style.width = `${width}%`;
    bar.append(fill);
  }
  return bar;
};
/** The method tag the API page uses everywhere, colored by method; the screen panel's API list uses it too. */
export const methodBadge = (method: string) => {
  const badge = element('span', method === 'ANY' ? '任何' : method, 'method-badge');
  badge.dataset.method = method;
  return badge;
};
const statusTag = (status: ApiStatus) => {
  const tag = element('span', apiStatusLabels[status], 'api-status');
  tag.dataset.apiStatus = status;
  return tag;
};
/** All APIs at a glance: one bar split by status, with the counts in words underneath. */
const statusSummary = (counts: Record<ApiStatus, number>) => {
  const box = element('div', undefined, 'api-summary'),
    keys = element('div', undefined, 'api-summary-keys');
  for (const key of STATUS_ORDER) {
    const item = element('span', `${apiStatusLabels[key]} ${counts[key]}`, 'api-summary-key');
    item.dataset.share = key;
    keys.append(item);
  }
  box.append(
    proportionBar(statusShares(counts), statusCountsLabel(counts), 'api-summary-bar'),
    keys,
  );
  return box;
};

export function apiPage(index: Index, state: ReviewState, options: ApiPageOptions): HTMLElement {
  const usage = deriveApiUsage(index.graph, state),
    statuses = apiStatuses(index, state),
    edges = index.graph.relationships || [];
  const records: ApiRecord[] = apiEndpoints(index).map((node) => {
    const method = endpointMethod(node),
      path = endpointPath(node);
    const handlers = edges
      .filter((e) => e.type === 'HANDLED_BY' && e.from === node.id)
      .map((e) => index.nodes.get(e.to))
      .filter((h): h is Node => !!h)
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));
    const callers = usage.get(node.id)!.callers,
      status = statuses.get(node.id)!;
    const external = status === 'UNREFERENCED' ? externalCallEvidence(node) : [];
    const searchable = [
      method,
      path,
      ...(external.length ? ['外部呼叫（Webhook）'] : []),
      node.attributes.aliases || '',
      node.attributes.logicalPath || '',
      ...handlers.map((h) => h.name),
      apiStatusLabels[status],
      ...callers.map(
        (c) =>
          `${index.nodes.get(c.screenId)?.name || ''} ${c.componentId ? componentLabelsForScreen(index, c.screenId).get(c.componentId) || '' : ''}`,
      ),
    ]
      .join(' ')
      .toLowerCase();
    return {
      node,
      method,
      path,
      handlers,
      callers,
      external,
      screens: new Set(callers.map((c) => c.screenId)).size,
      status,
      note: systemEntry(node, index),
      searchable,
      controller: controllerOf(handlers),
      prefix: urlPrefix(path),
    };
  });
  const byId = new Map(records.map((r) => [r.node.id, r])),
    mostScreens = Math.max(0, ...records.map((r) => r.screens));
  // Code that runs without a screen: listed under the APIs, never counted as one (ADR 0159).
  const jobs = backgroundJobs(index.graph),
    jobById = new Map(jobs.map((j) => [j.node.id, j])),
    jobSearch = new Map(
      jobs.map((j) => [
        j.node.id,
        [
          '系統自動作業',
          jobTriggerLabels[j.trigger],
          j.node.name,
          j.text,
          j.expression,
          j.eventType || '',
          j.node.attributes.class || '',
        ]
          .join(' ')
          .toLowerCase(),
      ]),
    );
  // Enum states some API or job sets, with who sets each value (ADR 0160).
  const states = stateTypes(index.graph),
    stateById = new Map(states.map((t) => [`state:${t.name}`, t])),
    stateSearch = new Map(
      states.map((t) => [
        `state:${t.name}`,
        ['資料狀態', t.name, ...t.fields, ...t.values.flatMap((v) => [v.value, v.label || ''])]
          .join(' ')
          .toLowerCase(),
      ]),
    );
  const known = (id: string) => byId.has(id) || jobById.has(id) || stateById.has(id);
  // Arriving from a screen for one API: show it whatever the list was narrowed to before.
  if (options.selected && known(options.selected)) {
    memory.filter = 'ALL';
    memory.query = '';
  }
  let selected = options.selected && known(options.selected) ? options.selected : undefined;

  const root = element('section', undefined, 'api-page'),
    master = element('div', undefined, 'api-master'),
    detail = element('aside', undefined, 'api-detail');
  detail.setAttribute('aria-label', 'API 詳情');
  const head = element('div', undefined, 'api-heading'),
    title = element('h1', 'API');
  title.append(element('span', String(records.length), 'api-total'));
  head.append(title, element('p', '狀態依目前的保留／移除標記即時計算。', 'api-intro'));
  if (records.length) head.append(statusSummary(apiStatusCounts(records.map((r) => r.status))));
  const search = element('input'),
    grouping = element('div', undefined, 'segmented api-grouping'),
    chips = element('div', undefined, 'chips');
  search.type = 'search';
  search.placeholder = '搜尋網址、處理程式或畫面';
  search.setAttribute('aria-label', '搜尋 API');
  search.value = memory.query;
  grouping.setAttribute('role', 'group');
  grouping.setAttribute('aria-label', '分組方式');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'API 狀態篩選');
  const toolbar = element('div', undefined, 'api-toolbar');
  toolbar.append(chips, grouping);
  const list = element('div', undefined, 'api-list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'API 清單');
  head.append(search, toolbar);
  master.append(head, list);
  root.append(
    master,
    splitter(root, {
      label: 'API 清單寬度',
      side: 'start',
      range: API_SPLIT,
      value: memory.split ?? API_SPLIT.initial,
      onChange: (value) => {
        memory.split = value;
      },
    }),
    detail,
  );

  const visible = (r: ApiRecord) => {
    const q = memory.query.trim().toLowerCase();
    return (
      (memory.filter === 'ALL' ||
        (memory.filter === 'IN_USE' ? r.status === 'IN_USE' : r.status !== 'IN_USE')) &&
      (!q || r.searchable.includes(q))
    );
  };
  const rows = () =>
    [...list.querySelectorAll<HTMLButtonElement>('.api-row')].filter(
      (row) => !row.closest('.api-group.is-collapsed'),
    );

  /** Scrolls only the list, never the page, and keeps the row clear of its group's sticky header. */
  const keepInView = (row: HTMLElement) => {
    const view = list.getBoundingClientRect(),
      box = row.getBoundingClientRect(),
      header =
        row.closest('.api-group')?.querySelector('.api-group-header')?.getBoundingClientRect()
          .height || 0;
    if (box.top < view.top + header) list.scrollTop -= view.top + header - box.top;
    else if (box.bottom > view.bottom) list.scrollTop += box.bottom - view.bottom;
  };
  const select = (id: string, focus = false) => {
    selected = id;
    options.onSelect?.(id);
    for (const row of list.querySelectorAll<HTMLElement>('.api-row')) {
      const on = row.dataset.apiRow === id;
      row.setAttribute('aria-selected', String(on));
      row.tabIndex = on ? 0 : -1;
    }
    const row = list.querySelector<HTMLElement>(`.api-row[data-api-row="${CSS.escape(id)}"]`);
    if (row) {
      if (focus) row.focus({ preventScroll: true });
      keepInView(row);
    }
    renderDetail();
  };

  /** The schedules, event listeners and startup code, as one group after the APIs. */
  const jobGroup = (items: BackgroundJob[], searching: boolean) => {
    const key = '系統自動作業',
      memoryKey = `jobs:${key}`,
      collapsed =
        !searching && memory.collapsed.has(memoryKey) && !items.some((j) => j.node.id === selected);
    const group = element('section', undefined, 'api-group api-job-group'),
      header = element('button', undefined, 'api-group-header'),
      body = element('div', undefined, 'api-group-items');
    group.dataset.apiGroup = key;
    group.dataset.jobGroup = 'true';
    group.classList.toggle('is-collapsed', collapsed);
    body.setAttribute('role', 'group');
    body.setAttribute('aria-label', key);
    header.type = 'button';
    header.setAttribute('aria-expanded', String(!collapsed));
    header.append(
      element('span', undefined, 'api-group-caret'),
      element('span', key, 'api-group-name'),
      element('span', String(items.length), 'api-group-count'),
    );
    header.onclick = () => {
      const now = !group.classList.contains('is-collapsed');
      group.classList.toggle('is-collapsed', now);
      header.setAttribute('aria-expanded', String(!now));
      if (now) memory.collapsed.add(memoryKey);
      else memory.collapsed.delete(memoryKey);
    };
    for (const job of items) {
      const row = element('button', undefined, 'api-row api-job-row');
      row.type = 'button';
      row.setAttribute('role', 'option');
      row.dataset.apiRow = job.node.id;
      row.dataset.jobRow = job.node.id;
      row.dataset.jobTrigger = job.trigger;
      row.title = `${job.node.name}：${job.text}`;
      const badge = element('span', jobTriggerLabels[job.trigger], 'job-badge');
      badge.dataset.jobTrigger = job.trigger;
      const text = element('span', undefined, 'api-job-text');
      text.append(
        element('span', job.text, 'api-job-when'),
        element('span', job.node.name, 'api-job-name'),
      );
      row.append(badge, text);
      row.onclick = () => select(job.node.id);
      body.append(row);
    }
    group.append(header, body);
    return group;
  };

  /** The enum states, as one group after the jobs. */
  const stateGroup = (items: StateType[], searching: boolean) => {
    const key = '資料狀態',
      memoryKey = `states:${key}`,
      collapsed =
        !searching &&
        memory.collapsed.has(memoryKey) &&
        !items.some((t) => `state:${t.name}` === selected);
    const group = element('section', undefined, 'api-group api-state-group'),
      header = element('button', undefined, 'api-group-header'),
      body = element('div', undefined, 'api-group-items');
    group.dataset.apiGroup = key;
    group.dataset.stateGroup = 'true';
    group.classList.toggle('is-collapsed', collapsed);
    body.setAttribute('role', 'group');
    body.setAttribute('aria-label', key);
    header.type = 'button';
    header.setAttribute('aria-expanded', String(!collapsed));
    header.append(
      element('span', undefined, 'api-group-caret'),
      element('span', key, 'api-group-name'),
      element('span', String(items.length), 'api-group-count'),
    );
    header.onclick = () => {
      const now = !group.classList.contains('is-collapsed');
      group.classList.toggle('is-collapsed', now);
      header.setAttribute('aria-expanded', String(!now));
      if (now) memory.collapsed.add(memoryKey);
      else memory.collapsed.delete(memoryKey);
    };
    for (const type of items) {
      const id = `state:${type.name}`,
        row = element('button', undefined, 'api-row api-job-row');
      row.type = 'button';
      row.setAttribute('role', 'option');
      row.dataset.apiRow = id;
      row.dataset.stateRow = type.name;
      const text = element('span', undefined, 'api-job-text');
      text.append(
        element(
          'span',
          type.values.map((v) => stateLabel(v.value, v.label)).join('、') || type.name,
          'api-job-when',
        ),
        element('span', `${type.name}・${type.fields.join('、')}`, 'api-job-name'),
      );
      row.append(element('span', `${type.values.length} 種`, 'job-badge state-badge'), text);
      row.onclick = () => select(id);
      body.append(row);
    }
    group.append(header, body);
    return group;
  };

  /** Buttons that open the APIs or job behind a write, or the handler's name when there is neither. */
  const writerLinks = (writer: StateType['unresolved'][number]) => {
    const box = element('span', undefined, 'state-writer-links');
    const go = (id: string, label: string) => {
      const link = element('button', label, 'api-caller');
      link.type = 'button';
      link.dataset.stateGoto = id;
      link.onclick = () => select(id);
      box.append(link);
    };
    for (const endpoint of writer.endpoints)
      go(endpoint.id, `${endpointMethod(endpoint)} ${endpointPath(endpoint)}`);
    if (jobById.has(writer.handler.id))
      go(writer.handler.id, `系統自動作業 ${writer.handler.name}`);
    if (!writer.endpoints.length && !jobById.has(writer.handler.id))
      box.append(element('span', writer.handler.name, 'api-job-call'));
    return box;
  };
  const writerLine = (writer: StateType['unresolved'][number]) => {
    const line = element('div', undefined, 'state-writer');
    line.append(writerLinks(writer));
    const where = [`在 ${writer.change.in}`];
    if (writer.change.reason) where.push(writer.change.reason);
    line.append(element('span', where.join('；'), 'muted'));
    if (writer.change.source?.file)
      line.append(
        element('code', `${writer.change.source.file}:${writer.change.source.line}`, 'api-source'),
      );
    return line;
  };

  const renderState = (type: StateType) => {
    const id = `state:${type.name}`,
      inner = element('div', undefined, 'api-detail-inner');
    inner.dataset.apiDetail = id;
    inner.dataset.stateDetail = type.name;
    const title = element('div', undefined, 'api-detail-title');
    title.append(
      element('span', '資料狀態', 'job-badge state-badge'),
      element('code', type.name, 'api-detail-path'),
    );
    inner.append(
      title,
      element('p', `欄位：${type.fields.join('、')}`, 'api-reason'),
      element(
        'p',
        '列出原始碼中把這個狀態設成各個值的 API 或系統作業。中文取自前端畫面的對照文字；前端各處寫法不一致時只顯示程式中的名稱。',
        'muted',
      ),
    );
    for (const value of type.values) {
      const box = section(stateLabel(value.value, value.label));
      box.dataset.stateValue = value.value;
      if (!value.writers.length)
        box.append(element('p', '原始碼中找不到設成這個值的地方。', 'muted'));
      for (const writer of value.writers) box.append(writerLine(writer));
      inner.append(box);
    }
    if (type.unresolved.length) {
      const box = section('設成哪個值無法確定');
      box.dataset.stateValue = '';
      for (const writer of type.unresolved) box.append(writerLine(writer));
      inner.append(box);
    }
    detail.append(inner);
    detail.scrollTop = 0;
  };

  /** What the handlers change, shown in an API's or a job's detail. */
  const changesSection = (handlers: Node[]) => {
    const rows = handlers.flatMap((h) => stateChanges(h));
    if (!rows.length) return undefined;
    const box = section('會改變的資料狀態');
    box.dataset.apiSection = 'state-changes';
    for (const change of rows) {
      const line = element('div', undefined, 'state-writer'),
        link = element('button', `${change.enum}.${change.field}`, 'api-caller');
      link.type = 'button';
      link.dataset.stateGoto = `state:${change.enum}`;
      link.onclick = () => select(`state:${change.enum}`);
      line.append(
        link,
        element(
          'strong',
          change.value ? `→ ${stateLabel(change.value, change.label)}` : '→ 無法確定',
        ),
      );
      if (change.reason) line.append(element('span', change.reason, 'muted'));
      if (change.source?.file)
        line.append(element('code', `${change.source.file}:${change.source.line}`, 'api-source'));
      box.append(line);
    }
    return box;
  };

  const renderJob = (job: BackgroundJob) => {
    const inner = element('div', undefined, 'api-detail-inner');
    inner.dataset.apiDetail = job.node.id;
    inner.dataset.jobDetail = job.node.id;
    const title = element('div', undefined, 'api-detail-title'),
      badge = element('span', jobTriggerLabels[job.trigger], 'job-badge');
    badge.dataset.jobTrigger = job.trigger;
    title.append(badge, element('code', job.node.name, 'api-detail-path'));
    const when = element('p', `執行時機：${job.text}`, 'api-reason');
    when.dataset.jobWhen = job.trigger;
    inner.append(
      title,
      when,
      element('p', '這段程式沒有畫面，由系統自動執行；不在 API 的保留／移除推導範圍內。', 'muted'),
    );
    if (job.note) {
      const note = element('p', job.note, 'notice');
      note.dataset.jobNote = 'true';
      inner.append(note);
    }
    const setting = section('原始設定');
    setting.dataset.apiSection = 'job-setting';
    setting.append(element('pre', job.expression, 'api-job-expression'));
    const source = job.node.source;
    if (source?.file)
      setting.append(
        element('code', `${source.file}${source.line ? `:${source.line}` : ''}`, 'api-source'),
      );
    inner.append(setting);
    if (job.trigger === 'EVENT') {
      const from = section('誰會觸發這個事件');
      from.dataset.apiSection = 'job-publishers';
      if (!job.publishers.length)
        from.append(element('p', '原始碼中找不到發布這個事件的地方。', 'muted'));
      for (const publisher of job.publishers) {
        const line = element('div', undefined, 'api-handler');
        line.append(element('strong', publisher.from));
        if (publisher.source?.file)
          line.append(
            element('code', `${publisher.source.file}:${publisher.source.line}`, 'api-source'),
          );
        from.append(line);
      }
      inner.append(from);
    }
    const calls = section('會做哪些事（後端呼叫）');
    calls.dataset.apiSection = 'job-calls';
    const list = backendCalls(job.node);
    if (!list.length) calls.append(element('p', '沒有分析到呼叫專案內的 Service／DAO。', 'muted'));
    else {
      const items = element('ol', undefined, 'api-job-calls');
      for (const call of list) {
        const item = element('li');
        item.style.marginInlineStart = `${(call.depth - 1) * 16}px`;
        item.append(
          element('span', call.to, 'api-job-call'),
          element(
            'span',
            ` ${call.layer}${call.resolution === 'CONFIRMED' ? '' : `・${call.resolution}`}`,
            'muted',
          ),
        );
        if (call.source?.file)
          item.append(element('code', `${call.source.file}:${call.source.line}`, 'api-source'));
        items.append(item);
      }
      calls.append(items);
    }
    inner.append(calls);
    const changed = changesSection([job.node]);
    if (changed) inner.append(changed);
    detail.append(inner);
    detail.scrollTop = 0;
  };

  const renderControls = () => {
    grouping.replaceChildren();
    for (const [value, label, description] of [
      ['controller', 'Controller', '依 Controller 分組'],
      ['url', '網址', '依網址分組'],
    ] as const) {
      const button = element('button', label);
      button.type = 'button';
      button.dataset.apiGrouping = value;
      button.title = description;
      button.setAttribute('aria-label', description);
      button.setAttribute('aria-pressed', String(memory.grouping === value));
      button.onclick = () => {
        memory.grouping = value;
        renderControls();
        renderList();
      };
      grouping.append(button);
    }
    chips.replaceChildren();
    const attention = records.filter((r) => r.status !== 'IN_USE').length;
    for (const [value, label, count] of [
      ['ALL', '全部', records.length],
      ['ATTENTION', '需要注意', attention],
      ['IN_USE', '使用中', records.length - attention],
    ] as const) {
      const chip = element('button', `${label} ${count}`, 'chip');
      chip.type = 'button';
      chip.dataset.apiFilter = value;
      chip.setAttribute('aria-pressed', String(memory.filter === value));
      if (value === 'ATTENTION' && count) chip.classList.add('is-attention');
      chip.onclick = () => {
        memory.filter = value;
        renderControls();
        renderList();
      };
      chips.append(chip);
    }
  };

  const renderList = () => {
    const shown = records.filter(visible),
      groups = new Map<string, ApiRecord[]>();
    for (const record of shown) {
      const key = memory.grouping === 'controller' ? record.controller : record.prefix;
      groups.set(key, [...(groups.get(key) || []), record]);
    }
    const keys = [...groups.keys()].sort(
      (a, b) => (a === NO_HANDLER ? 1 : 0) - (b === NO_HANDLER ? 1 : 0) || a.localeCompare(b, 'en'),
    );
    list.replaceChildren();
    const query = memory.query.trim().toLowerCase(),
      shownJobs =
        memory.filter === 'ALL'
          ? jobs.filter((j) => !query || jobSearch.get(j.node.id)!.includes(query))
          : [],
      shownStates =
        memory.filter === 'ALL'
          ? states.filter((t) => !query || stateSearch.get(`state:${t.name}`)!.includes(query))
          : [];
    if (!shown.length && !shownJobs.length && !shownStates.length)
      list.append(element('p', '沒有符合的 API', 'empty-list'));
    const searching = !!memory.query.trim();
    for (const key of keys) {
      const items = groups
        .get(key)!
        .sort(
          (a, b) => a.path.localeCompare(b.path, 'en') || a.method.localeCompare(b.method, 'en'),
        );
      const memoryKey = `${memory.grouping}:${key}`,
        collapsed =
          !searching &&
          memory.collapsed.has(memoryKey) &&
          !items.some((r) => r.node.id === selected);
      const group = element('section', undefined, 'api-group'),
        header = element('button', undefined, 'api-group-header'),
        body = element('div', undefined, 'api-group-items');
      group.dataset.apiGroup = key;
      group.classList.toggle('is-collapsed', collapsed);
      body.setAttribute('role', 'group');
      body.setAttribute('aria-label', key);
      header.type = 'button';
      header.setAttribute('aria-expanded', String(!collapsed));
      const attention = items.filter((r) => r.status !== 'IN_USE').length;
      const counts = apiStatusCounts(items.map((r) => r.status));
      header.append(
        element('span', undefined, 'api-group-caret'),
        element('span', key, 'api-group-name'),
        element('span', String(items.length), 'api-group-count'),
      );
      if (attention) header.append(element('span', `${attention} 需要注意`, 'api-group-attention'));
      header.append(
        proportionBar(statusShares(counts), statusCountsLabel(counts), 'api-group-bar', true),
      );
      header.onclick = () => {
        const now = !group.classList.contains('is-collapsed');
        group.classList.toggle('is-collapsed', now);
        header.setAttribute('aria-expanded', String(!now));
        if (now) memory.collapsed.add(memoryKey);
        else memory.collapsed.delete(memoryKey);
      };
      for (const record of items) {
        const row = element('button', undefined, 'api-row');
        row.type = 'button';
        row.setAttribute('role', 'option');
        row.dataset.apiRow = record.node.id;
        row.dataset.apiStatus = record.status;
        row.title = `${record.method} ${record.path}`;
        const meta = element('span', undefined, 'api-row-meta');
        meta.append(
          callerBar(record.screens, mostScreens),
          element(
            'span',
            record.screens ? `${record.screens} 個畫面` : '沒有呼叫來源',
            'api-screen-count',
          ),
        );
        if (record.status !== 'IN_USE') meta.append(statusTag(record.status));
        const direct = apiDecision(state, record.node.id);
        if (direct !== 'UNDECIDED') {
          const mark = element('span', decisionLabel(direct), 'api-decision-mark');
          mark.dataset.apiDecision = direct;
          meta.append(mark);
        }
        if (record.external.length)
          meta.append(element('span', '外部呼叫（Webhook）', 'api-external-call'));
        const main = element('span', undefined, 'api-row-main');
        main.append(pathCode(record.path, 'api-path'));
        const purpose = apiPurpose(index, record.callers, record.external.length > 0);
        if (purpose) main.append(element('span', purpose.short, 'api-row-purpose'));
        row.append(methodBadge(record.method), main, meta);
        row.onclick = () => select(record.node.id);
        body.append(row);
      }
      group.append(header, body);
      list.append(group);
    }
    if (shownJobs.length) list.append(jobGroup(shownJobs, searching));
    if (shownStates.length) list.append(stateGroup(shownStates, searching));
    // Keep the selection on a visible API; when it is filtered away, the first one shown takes its place.
    const ids = rows().map((row) => row.dataset.apiRow!);
    if (!selected || !ids.includes(selected)) selected = ids[0];
    if (selected) select(selected);
    else renderDetail();
  };

  list.addEventListener('keydown', (event) => {
    const all = rows(),
      at = all.findIndex((row) => row.dataset.apiRow === selected);
    const target =
      event.key === 'ArrowDown'
        ? all[Math.min(all.length - 1, at + 1)]
        : event.key === 'ArrowUp'
          ? all[Math.max(0, at - 1)]
          : event.key === 'Home'
            ? all[0]
            : event.key === 'End'
              ? all.at(-1)
              : undefined;
    if (!target) return;
    event.preventDefault();
    select(target.dataset.apiRow!, true);
  });
  search.oninput = () => {
    memory.query = search.value;
    renderList();
  };

  const removed = (caller: Caller) =>
    screenDecision(state, caller.screenId) === 'REMOVE' ||
    (!!caller.componentId &&
      componentDecision(state, caller.screenId, caller.componentId) === 'REMOVE');
  const callerButton = (caller: Caller, label: string) => {
    const link = element('button', undefined, 'api-caller');
    link.type = 'button';
    link.dataset.callerScreen = caller.screenId;
    if (caller.componentId) link.dataset.callerComponent = caller.componentId;
    link.append(element('span', label, 'api-caller-label'));
    if (removed(caller)) {
      link.classList.add('is-removed');
      link.append(element('span', '已標記移除', 'api-removed-tag'));
    }
    link.onclick = () => options.onCaller(caller.screenId, caller.componentId);
    return link;
  };
  /** Screen → what triggers it → this API → handler, as three linked stages; each screen opens it at the caller. */
  const renderChain = (record: ApiRecord) => {
    const screens = chainScreens(index, record.callers),
      handlerCount = record.handlers.length;
    const chain = element('div', undefined, 'api-chain');
    chain.dataset.apiSection = 'chain';
    chain.setAttribute('role', 'group');
    chain.setAttribute(
      'aria-label',
      `呼叫鏈：${screens.length ? `${screens.length} 個畫面` : '沒有呼叫來源'} → ${record.method} ${record.path} → ${handlerCount ? `${handlerCount} 個處理程式` : NO_HANDLER}`,
    );
    const stage = (key: string, heading: string) => {
      const box = element('div', undefined, 'api-chain-stage');
      box.dataset.chainStage = key;
      box.append(element('span', heading, 'api-chain-heading'));
      const items = element('div', undefined, 'api-chain-items');
      box.append(items);
      return { box, items };
    };
    const more = (items: HTMLElement, rest: number, unit: string) => {
      if (rest > 0) items.append(element('span', `還有 ${rest} 個${unit}`, 'api-chain-more'));
    };
    const arrow = () => {
      const link = element('span', undefined, 'api-chain-link');
      link.setAttribute('aria-hidden', 'true');
      return link;
    };
    const from = stage('screens', `畫面 ${screens.length}`);
    if (!screens.length)
      from.items.append(element('span', '沒有呼叫來源', 'api-chain-node is-empty'));
    for (const item of screens.slice(0, CHAIN_LIMIT)) {
      const node = element('button', undefined, 'api-chain-node');
      node.type = 'button';
      node.dataset.chainScreen = item.screenId;
      node.append(
        element('span', index.nodes.get(item.screenId)?.name || '畫面', 'api-chain-name'),
        element(
          'span',
          item.triggers.length > 1 ? `${item.triggers.length} 個觸發` : item.triggers[0],
          'api-chain-trigger',
        ),
      );
      node.title = item.triggers.join('、');
      if (
        screenDecision(state, item.screenId) === 'REMOVE' ||
        record.callers.filter((c) => c.screenId === item.screenId).every(removed)
      )
        node.classList.add('is-removed');
      node.onclick = () => options.onCaller(item.screenId);
      from.items.append(node);
    }
    more(from.items, screens.length - CHAIN_LIMIT, '畫面');
    const api = stage('api', 'API'),
      self = element('span', undefined, 'api-chain-node is-self');
    self.dataset.apiStatus = record.status;
    self.append(methodBadge(record.method), pathCode(record.path, 'api-chain-name'));
    api.items.append(self);
    const to = stage('handlers', `處理程式 ${handlerCount}`);
    if (!handlerCount) to.items.append(element('span', NO_HANDLER, 'api-chain-node is-empty'));
    for (const handler of record.handlers.slice(0, CHAIN_LIMIT)) {
      const node = element('span', undefined, 'api-chain-node');
      node.append(element('span', handler.name, 'api-chain-name'));
      to.items.append(node);
    }
    more(to.items, handlerCount - CHAIN_LIMIT, '處理程式');
    chain.append(from.box, arrow(), api.box, arrow(), to.box);
    return chain;
  };
  const section = (heading: string) => {
    const box = element('section', undefined, 'api-section');
    box.append(element('h3', heading));
    return box;
  };

  const renderCallers = (record: ApiRecord) => {
    const box = section(`呼叫來源 ${record.screens} 個畫面`);
    box.dataset.apiSection = 'callers';
    if (!record.callers.length) {
      box.append(element('p', '畫面中找不到呼叫這個 API 的地方。', 'muted'));
      return box;
    }
    // A caller written once and reached from many screens (a layout's logout button, an app-wide load call) is one
    // shared entry: keyed by the component's source line, or by the load call's own code.
    const sharedKey = (caller: Caller) => {
      if (caller.componentId) {
        const source = index.nodes.get(caller.componentId)?.source;
        return source?.file && source.file !== '.'
          ? `component:${source.file}:${source.line ?? ''}`
          : `component:${caller.componentId}`;
      }
      const behavior = index.behaviors.get(caller.behaviorId || '');
      return behavior
        ? `behavior:${behavior.event || ''}|${behavior.expression || ''}|${behavior.guard || ''}`
        : undefined;
    };
    const screensOf = new Map<string, Set<string>>();
    for (const caller of record.callers) {
      const key = sharedKey(caller);
      if (key) screensOf.set(key, new Set([...(screensOf.get(key) || []), caller.screenId]));
    }
    const shared = new Set(
      [...screensOf].filter(([, screens]) => screens.size >= SHARED_SCREENS).map(([key]) => key),
    );
    const isShared = (caller: Caller) => {
      const key = sharedKey(caller);
      return !!key && shared.has(key);
    };
    const own = new Map<string, Caller[]>();
    for (const caller of record.callers)
      if (!isShared(caller))
        own.set(caller.screenId, [...(own.get(caller.screenId) || []), caller]);
    const name = (id: string) => index.nodes.get(id)?.name || '畫面';
    const byName = (a: string, b: string) => name(a).localeCompare(name(b), 'zh-Hant');
    for (const [key, screens] of [...screensOf]
      .filter(([key]) => shared.has(key))
      .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0], 'en'))) {
      const callers = record.callers.filter((c) => sharedKey(c) === key),
        first = callers[0],
        component = first.componentId ? index.nodes.get(first.componentId) : undefined;
      const fold = element('details', undefined, 'api-shared'),
        summary = element('summary');
      fold.dataset.apiShared = key;
      summary.append(
        element(
          'span',
          component
            ? `共用按鈕「${callerLabel(index, first).replace(/（第 \d+ 個）$/, '')}」`
            : `${callerLabel(index, first)}（共用程式）`,
          'api-shared-name',
        ),
        element('span', `${screens.size} 個畫面`, 'muted'),
      );
      if (component?.source?.file && component.source.file !== '.')
        summary.append(
          element(
            'code',
            `${component.source.file}${component.source.line ? `:${component.source.line}` : ''}`,
            'api-source',
          ),
        );
      const triggers = element('div', undefined, 'api-caller-list');
      const perScreen = new Map<string, Caller>();
      for (const caller of callers)
        if (!perScreen.has(caller.screenId)) perScreen.set(caller.screenId, caller);
      for (const [screenId, caller] of [...perScreen].sort((a, b) => byName(a[0], b[0])))
        triggers.append(callerButton(caller, name(screenId)));
      fold.append(summary, triggers);
      box.append(fold);
    }
    for (const [screenId, callers] of [...own].sort((a, b) => byName(a[0], b[0]))) {
      const group = element('div', undefined, 'api-caller-screen'),
        link = element('button', name(screenId), 'api-screen-link');
      link.type = 'button';
      link.dataset.callerScreen = screenId;
      link.onclick = () => options.onCaller(screenId);
      if (screenDecision(state, screenId) === 'REMOVE') group.classList.add('is-removed');
      const triggers = element('div', undefined, 'api-caller-list');
      for (const caller of callers)
        triggers.append(callerButton(caller, callerLabel(index, caller)));
      group.append(link, triggers);
      box.append(group);
    }
    return box;
  };

  type Field = { name?: unknown; type?: unknown; location?: unknown; required?: unknown };
  type Body = { contentType?: unknown; bodyType?: unknown; fields?: unknown; status?: unknown };
  const text = (value: unknown) =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const fieldTable = (fields: Field[]) => {
    const table = element('table', undefined, 'api-fields'),
      head = element('tr');
    for (const label of ['欄位', '型別', '位置', '必填']) head.append(element('th', label));
    const thead = element('thead');
    thead.append(head);
    const tbody = element('tbody');
    for (const field of fields) {
      const row = element('tr');
      const name = element('td');
      name.append(element('code', text(field.name)));
      row.append(
        name,
        element('td', text(field.type)),
        element('td', text(field.location)),
        element('td', field.required === true ? '是' : field.required === false ? '否' : ''),
      );
      tbody.append(row);
    }
    table.append(thead, tbody);
    return table;
  };
  const bodyBlock = (heading: string, body: Body) => {
    const block = element('div', undefined, 'api-contract-part'),
      fields = Array.isArray(body.fields) ? (body.fields as Field[]) : [];
    block.append(element('h4', heading));
    const facts = [text(body.bodyType), text(body.contentType)].filter(Boolean);
    if (facts.length) {
      const line = element('p', undefined, 'api-contract-type');
      facts.forEach((fact, i) => {
        if (i) line.append(' · ');
        line.append(element('code', fact));
      });
      block.append(line);
    }
    if (fields.length) block.append(fieldTable(fields));
    else if (!facts.length) block.append(element('p', '沒有分析到內容。', 'muted'));
    return block;
  };
  const renderContract = (record: ApiRecord) => {
    const contract = (index.graph.apiContracts || []).find((c) => c.endpointId === record.node.id);
    if (!contract) return undefined;
    const request = (contract.request || {}) as Body,
      responses = (Array.isArray(contract.responses) ? contract.responses : []) as Body[];
    const fold = element('details', undefined, 'api-contract');
    fold.append(element('summary', 'Request／Response'));
    fold.append(bodyBlock('Request', request));
    for (const response of responses)
      fold.append(bodyBlock(`Response ${text(response.status)}`.trim(), response));
    return fold;
  };

  const reason = (record: ApiRecord) =>
    record.note
      ? `${record.note}：由系統設定進入，視為使用中。`
      : record.status === 'IN_USE'
        ? `${record.screens} 個畫面會呼叫這個 API。`
        : record.status === 'UNREFERENCED'
          ? '畫面中找不到呼叫這個 API 的地方。排程、其他系統或直接輸入網址仍可能使用，刪除前請先確認。'
          : '所有呼叫來源都已標記移除，依目前的標記可以移除。這是推導結果，不是刪除建議。';

  const renderDetail = () => {
    detail.replaceChildren();
    const job = selected ? jobById.get(selected) : undefined;
    if (job) {
      renderJob(job);
      return;
    }
    const stateType = selected ? stateById.get(selected) : undefined;
    if (stateType) {
      renderState(stateType);
      return;
    }
    const record = selected ? byId.get(selected) : undefined;
    if (!record) {
      detail.append(element('p', '選一個 API 查看詳情', 'empty-list'));
      return;
    }
    const inner = element('div', undefined, 'api-detail-inner');
    inner.dataset.apiDetail = record.node.id;
    if (record.node.attributes.externalLogin === 'true')
      inner.append(
        element(
          'p',
          `外部登入：${record.node.attributes.externalLoginReturns ? `完成後回到 ${record.node.attributes.externalLoginReturns.split('\u001f').join('、')}` : '完成後的導回路徑無法確定'}`,
          'notice',
        ),
      );
    const title = element('div', undefined, 'api-detail-title');
    title.append(
      methodBadge(record.method),
      pathCode(record.path, 'api-detail-path'),
      statusTag(record.status),
    );
    const why = element('p', reason(record), record.note ? 'api-reason api-note' : 'api-reason');
    why.dataset.apiStatus = record.status;
    inner.append(title);
    const purpose = apiPurpose(index, record.callers, record.external.length > 0);
    if (purpose) {
      const line = element('p', `用途：${purpose.sentence}`, 'api-purpose');
      line.dataset.apiPurpose = 'true';
      inner.append(line);
    }
    inner.append(why);
    if (options.setApi) {
      // The person's own decision on this API, shown beside the status its callers give it.
      const id = record.node.id,
        direct = apiDecision(state, id),
        box = element('div', undefined, 'api-decision');
      box.dataset.apiDecisionFor = id;
      box.append(
        element('span', '這個 API', 'api-decision-label'),
        decisionSwitch(`這個 API`, direct, (value) => options.setApi!(id, value), {
          screen: `api:${id}`,
        }),
      );
      const disagree =
        (direct === 'KEEP' && record.status === 'REMOVABLE') ||
        (direct === 'REMOVE' && record.status === 'IN_USE');
      if (disagree) {
        const note = element(
          'p',
          direct === 'KEEP'
            ? '已標記保留，但所有呼叫來源都已標記移除；請確認是否還有其他使用者。'
            : '已標記移除，但仍有未移除的畫面或按鈕呼叫它；請一併確認這些呼叫來源。',
          'notice conflict',
        );
        note.dataset.apiConflict = id;
        box.append(note);
      }
      if (options.setNote)
        box.append(
          noteEditor({
            label: '這個 API',
            decision: direct,
            note: decisionNoteOf(state, 'api', id),
            open: !!options.notesOpen?.has(id),
            onToggle: (open) => {
              if (open) options.notesOpen?.add(id);
              else options.notesOpen?.delete(id);
            },
            onInput: (note) => options.setNote!(id, note),
            onCommit: () => options.commitNote?.(),
          }),
        );
      inner.append(box);
    }
    inner.append(renderChain(record));
    // On a wide screen the handler and contract are the left column and the callers the right; narrower, one column.
    const columns = element('div', undefined, 'api-detail-columns'),
      main = element('div', undefined, 'api-detail-main'),
      side = element('div', undefined, 'api-detail-side');
    columns.append(main, side);
    inner.append(columns);
    if (record.external.length) {
      const box = section('外部呼叫（Webhook）');
      box.dataset.apiSection = 'external-call';
      box.append(
        element('p', '公開存取與 CSRF 例外設定均有來源證據；狀態維持未被使用，不授權移除。'),
      );
      for (const proof of record.external) {
        const value = JSON.parse(proof.detail!),
          line = element('p');
        line.append(
          element('code', value.kind + ' ' + value.pattern),
          element('code', `${proof.source!.file}:${proof.source!.line}`, 'api-source'),
        );
        box.append(line);
      }
      main.append(box);
    }

    const handlers = section('處理程式');
    handlers.dataset.apiSection = 'handlers';
    if (!record.handlers.length) handlers.append(element('p', NO_HANDLER, 'muted'));
    for (const handler of record.handlers) {
      const line = element('div', undefined, 'api-handler');
      line.append(element('strong', handler.name));
      const source = handler.source || record.node.source;
      if (source?.file)
        line.append(
          element('code', `${source.file}${source.line ? `:${source.line}` : ''}`, 'api-source'),
        );
      handlers.append(line);
    }
    main.append(handlers);
    const changed = changesSection(record.handlers);
    if (changed) main.append(changed);
    side.append(renderCallers(record));
    const contract = renderContract(record);
    if (contract) main.append(contract);
    detail.append(inner);
    detail.scrollTop = 0;
  };

  renderControls();
  renderList();
  return root;
}
