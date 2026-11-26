import { endpointGroup, endpointMethod, endpointPath } from './endpoint-presentation';
import {
  deriveApiUsage,
  screenDecision,
  componentDecision,
  apiDecision,
  effectiveScreen,
  Decision,
  DecisionNote,
  ReviewState,
} from './shared/review';
import { decisionSwitch, decisionLabel } from './review-ui';
import { componentLabelsForScreen, kindNames } from './labels';
import { callerKind, Caller } from './usage';
import { Index } from './map';
import { Node, Evidence } from './contracts';
import { element } from './text';
import { rolePartition, roleTint } from './personas';
import { proportionBar } from './proportion';
import { requestFieldSources, responseSummary } from './api-fields';
import { copySource } from './api-copy';
import { splitter, SplitRange } from './splitter';
import { backgroundJobs, jobTriggerLabels, BackgroundJob } from './shared/jobs';
import { backendCalls } from './shared/review-md';
import {
  priorText,
  stateChanges,
  stateLabel,
  stateTransitions,
  stateTypes,
  StateType,
} from './shared/states';

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
    // `busy ? '送出中…' : '送出'` reads as both; the in-progress wording is left out. A button whose
    // only provable text is in-progress wording is described by it (ADR 0177).
    const all = text.split(' / '),
      options = all.filter((o) => !/(中|…|\.\.\.)$/.test(o.trim()));
    text = options.length ? options.join(' / ') : `顯示「${all.join(' / ')}」的按鈕`;
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
}

/** A component calling from this many screens is a shared one (a header, a layout), listed once instead of per screen. */
const SHARED_SCREENS = 3;
const NO_HANDLER = '找不到處理程式';
/** What the page keeps while the report is open: leaving for a screen and coming back finds the list as it was. */
const memory = {
  query: '',
  split: undefined as number | undefined,
};
/** The API list's share of the page width: 340px on a 1440px window at first; the CSS keeps it between 340px and 400px. */
export const API_SPLIT: SplitRange = { initial: 23.6, min: 20, max: 50 };

const controllerOf = (handlers: Node[]) => {
  const handler = handlers
    // The list names a controller by its simple class name.
    .map((h) => (h.attributes.class || h.name.split('.')[0]).split('.').pop()!)
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
/** A path as plain text that may wrap only after a `/`, so a long path breaks between its segments. */
const breakablePath = (path: string, className: string) => {
  const span = element('span', undefined, className);
  path.split(/(?<=\/)/).forEach((part, i) => {
    if (i) span.append(element('wbr'));
    span.append(part);
  });
  return span;
};
/** The method tag the API page uses everywhere, colored by method; the screen panel's API list uses it too. */
export const methodBadge = (method: string) => {
  const badge = element('span', method === 'ANY' ? '任何' : method, 'method-badge');
  badge.dataset.method = method;
  return badge;
};
/** The status pill; an unused API with proven outside callers says so (「未被使用 · Webhook」). */
const statusTag = (status: ApiStatus, external = false) => {
  const tag = element(
    'span',
    `${apiStatusLabels[status]}${status === 'UNREFERENCED' && external ? ' · Webhook' : ''}`,
    'api-status',
  );
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
    };
  });
  const byId = new Map(records.map((r) => [r.node.id, r]));
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
    memory.query = '';
  }
  let selected = options.selected && known(options.selected) ? options.selected : undefined;

  const root = element('section', undefined, 'api-page'),
    master = element('div', undefined, 'api-master'),
    detail = element('aside', undefined, 'api-detail');
  detail.setAttribute('aria-label', 'API 詳情');
  // The list: a labelled search box, the status bar with its counts, then the APIs by controller.
  const head = element('div', undefined, 'api-heading'),
    searchLabel = element('label', '搜尋網址、處理程式或畫面', 'api-search'),
    search = element('input');
  search.type = 'search';
  search.placeholder = '/api/applications';
  search.value = memory.query;
  searchLabel.append(search);
  head.append(searchLabel);
  if (records.length) head.append(statusSummary(apiStatusCounts(records.map((r) => r.status))));
  const list = element('div', undefined, 'api-list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'API 清單');
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
    return !q || r.searchable.includes(q);
  };
  const rows = () => [...list.querySelectorAll<HTMLButtonElement>('.api-row')];

  /** Scrolls only the list, never the page. */
  const keepInView = (row: HTMLElement) => {
    const view = list.getBoundingClientRect(),
      box = row.getBoundingClientRect();
    if (box.top < view.top) list.scrollTop -= view.top - box.top;
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

  /** A group of rows under a plain header: its name and how many rows it holds. */
  const group = (key: string, count: number, mono: boolean) => {
    const box = element('section', undefined, 'api-group'),
      header = element('div', undefined, 'api-group-header'),
      body = element('div', undefined, 'api-group-items');
    box.dataset.apiGroup = key;
    body.setAttribute('role', 'group');
    body.setAttribute('aria-label', key);
    header.append(
      element('span', key, mono ? 'api-group-name is-mono' : 'api-group-name'),
      element('span', String(count), 'api-group-count'),
    );
    box.append(header, body);
    return { box, body };
  };

  /** The schedules, event listeners and startup code, as one group after the APIs. */
  const jobGroup = (items: BackgroundJob[]) => {
    const { box, body } = group('系統自動作業', items.length, false);
    box.classList.add('api-job-group');
    box.dataset.jobGroup = 'true';
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
    return box;
  };

  /** The enum states, as one group after the jobs. */
  const stateGroup = (items: StateType[]) => {
    const { box, body } = group('資料狀態', items.length, false);
    box.classList.add('api-state-group');
    box.dataset.stateGroup = 'true';
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
    return box;
  };
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
    const prior = priorText(writer.change);
    if (prior) where.unshift(`原本：${prior}（推測）`);
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
        '列出原始碼中把這個狀態設成各個值的 API 或系統作業。中文取自前端畫面的對照文字，前端各處寫法不同時以「／」全部列出；前端沒有對照時只顯示程式中的名稱。',
        'muted',
      ),
    );
    const transitions = stateTransitions(type);
    if (transitions.length) {
      const flow = section('狀態轉換（推測）');
      flow.dataset.stateFlow = type.name;
      flow.append(
        element(
          'p',
          '由寫入處的條件推得原狀態；沒有列出的轉換表示推不出原狀態，不代表不會發生。',
          'muted',
        ),
      );
      const word = (v?: string) =>
        v === undefined ? '新建立' : stateLabel(v, type.values.find((x) => x.value === v)?.label);
      const list = element('ol', undefined, 'state-flow');
      for (const t of transitions) {
        const item = element('li');
        item.dataset.stateFrom = t.from ?? '';
        item.dataset.stateTo = t.to;
        if (t.partial) item.dataset.statePartial = 'true';
        item.append(
          element('strong', `${word(t.from)} → ${word(t.to)}`),
          element(
            'span',
            `由 ${[...new Set(t.writers.flatMap((w) => (w.endpoints.length ? w.endpoints.map((e) => `${endpointMethod(e)} ${endpointPath(e)}`) : [w.handler.name])))].join('、')}`,
            'muted',
          ),
        );
        if (t.partial) item.append(element('span', '另有推不出原狀態的進入方式', 'muted'));
        list.append(item);
      }
      flow.append(list);
      inner.append(flow);
    }
    for (const value of type.values) {
      const box = section(stateLabel(value.value, value.label));
      box.dataset.stateValue = value.value;
      if (value.words?.length) {
        const words = element(
          'p',
          `前端有 ${value.words.length} 種寫法：${value.words
            .map(
              (w) =>
                `「${w.text}」${w.source?.file ? `（${w.source.file}:${w.source.line}）` : ''}`,
            )
            .join('、')}`,
          'muted',
        );
        words.dataset.stateWords = value.value;
        box.append(words);
      }
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
      const prior = priorText(change);
      line.append(
        link,
        element(
          'strong',
          `${prior ? `${prior} ` : ''}${change.value ? `→ ${stateLabel(change.value, change.label)}` : '→ 無法確定'}`,
        ),
      );
      if (prior) line.append(element('span', '原狀態為推測', 'muted'));
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

  /** What a row shows on its right: the number of calling screens, or the status when it is not in use. */
  const rowMeta = (record: ApiRecord) => {
    const meta = element('span', undefined, 'api-row-meta');
    if (record.status === 'IN_USE')
      meta.append(element('span', `${record.screens} 畫面`, 'api-screen-count'));
    else meta.append(statusTag(record.status, record.external.length > 0));
    const direct = apiDecision(state, record.node.id);
    if (direct !== 'UNDECIDED') {
      const mark = element('span', decisionLabel(direct), 'api-decision-mark');
      mark.dataset.apiDecision = direct;
      meta.append(mark);
    }
    return meta;
  };

  const renderList = () => {
    const shown = records.filter(visible),
      groups = new Map<string, ApiRecord[]>();
    for (const record of shown)
      groups.set(record.controller, [...(groups.get(record.controller) || []), record]);
    const keys = [...groups.keys()].sort(
      (a, b) => (a === NO_HANDLER ? 1 : 0) - (b === NO_HANDLER ? 1 : 0) || a.localeCompare(b, 'en'),
    );
    list.replaceChildren();
    const query = memory.query.trim().toLowerCase(),
      shownJobs = jobs.filter((j) => !query || jobSearch.get(j.node.id)!.includes(query)),
      shownStates = states.filter(
        (t) => !query || stateSearch.get(`state:${t.name}`)!.includes(query),
      );
    if (!shown.length && !shownJobs.length && !shownStates.length)
      list.append(element('p', '沒有符合的 API', 'empty-list'));
    for (const key of keys) {
      const items = groups
        .get(key)!
        .sort(
          (a, b) => a.path.localeCompare(b.path, 'en') || a.method.localeCompare(b.method, 'en'),
        );
      const { box, body } = group(key, items.length, key !== NO_HANDLER);
      for (const record of items) {
        const row = element('button', undefined, 'api-row');
        row.type = 'button';
        row.setAttribute('role', 'option');
        row.dataset.apiRow = record.node.id;
        row.dataset.apiStatus = record.status;
        row.title = `${record.method} ${record.path}`;
        // The list shows only the API itself; what it is for is in the detail.
        row.append(
          methodBadge(record.method),
          breakablePath(record.path, 'api-path'),
          rowMeta(record),
        );
        row.onclick = () => select(record.node.id);
        body.append(row);
      }
      list.append(box);
    }
    if (shownJobs.length) list.append(jobGroup(shownJobs));
    if (shownStates.length) list.append(stateGroup(shownStates));
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
  // A screen shows its role's tint here as everywhere else (ADR 0188).
  const roles = rolePartition(index);
  const tintOf = (screenId: string) =>
    roles ? roleTint(index.graph, roles.of.get(screenId)) : 'none';
  const tint = (el: HTMLElement, screenId: string) => {
    if (roles) el.dataset.roleTint = tintOf(screenId);
  };
  const name = (id: string) => index.nodes.get(id)?.name || '畫面';
  /** What kind of element triggers the call, as a short tag (a submit button reads 按鈕). */
  const triggerKind = (caller: Caller) => {
    if (!caller.componentId) return callerKind(index, caller) === 'unresolved' ? '不明' : '載入';
    const kind = index.nodes.get(caller.componentId)?.attributes.kind || '';
    return kind === 'SUBMIT' ? '按鈕' : kindNames[kind] || '元件';
  };
  /** A trigger's own words, without the kind word the label may start or end with. */
  const triggerText = (caller: Caller) => {
    const kind = triggerKind(caller);
    let label = callerLabel(index, caller);
    if (label.startsWith(kind))
      label = label.slice(kind.length).replace(/^（(.*)）$/, '$1') || label;
    const named = kindNames[index.nodes.get(caller.componentId || '')?.attributes.kind || ''];
    if (named && label.endsWith(` ${named}`)) label = label.slice(0, -named.length - 1);
    return label;
  };
  /** Where a trigger is written: its component's source line, or the evidence of its load call. */
  const triggerSource = (caller: Caller) => {
    if (caller.componentId) return index.nodes.get(caller.componentId)?.source;
    return index.behaviors.get(caller.behaviorId || '')?.evidence?.find((e) => e.source?.file)
      ?.source;
  };
  /** A form whose own submit buttons are listed among the callers is the same action: keep the buttons. */
  const withoutSubmittedForms = (callers: Caller[]) => {
    const submitted = new Set(
      callers
        .map((c) => (c.componentId ? index.nodes.get(c.componentId)?.attributes.formId : undefined))
        .filter((id): id is string => !!id),
    );
    return callers.filter((c) => !c.componentId || !submitted.has(c.componentId));
  };
  const location = (source?: { file?: string; line?: number }) =>
    source?.file && source.file !== '.'
      ? `${source.file}${source.line ? `:${source.line}` : ''}`
      : undefined;
  const shortLocation = (source?: { file?: string; line?: number }) =>
    location(source)?.split('/').pop();

  interface Cell {
    label: string;
    name: string;
    mono?: boolean;
    sub?: string;
    subMono?: boolean;
    source?: string;
    /** Not proven by the analysis: drawn dashed. */
    unproven?: boolean;
    kind?: 'screen' | 'api';
    screenId?: string;
    removed?: boolean;
    title?: string;
  }
  const chainNode = (cell: Cell) => {
    const node = element(cell.source ? 'button' : 'div', undefined, 'api-chain-node');
    if (node instanceof HTMLButtonElement) {
      node.type = 'button';
      node.dataset.copySource = cell.source;
      node.title = `${cell.title ? `${cell.title}\n` : ''}${cell.source}（點擊複製路徑）`;
      node.onclick = () => copySource(cell.source!, node);
    } else if (cell.title) node.title = cell.title;
    if (cell.kind) node.dataset.chainKind = cell.kind;
    if (cell.screenId) {
      node.dataset.chainScreen = cell.screenId;
      tint(node, cell.screenId);
    }
    if (cell.unproven) node.classList.add('is-unproven');
    if (cell.removed) node.classList.add('is-removed');
    node.append(
      element('span', cell.label, 'api-chain-label'),
      element('span', cell.name, cell.mono ? 'api-chain-name is-mono' : 'api-chain-name'),
    );
    if (cell.sub)
      node.append(
        element('span', cell.sub, cell.subMono ? 'api-chain-sub is-mono' : 'api-chain-sub'),
      );
    return node;
  };
  const column = (key: string, cells: Cell[], unit: string) => {
    const box = element('div', undefined, 'api-chain-col');
    box.dataset.chainStage = key;
    for (const cell of cells.slice(0, CHAIN_LIMIT)) box.append(chainNode(cell));
    if (cells.length > CHAIN_LIMIT)
      box.append(element('span', `還有 ${cells.length - CHAIN_LIMIT} 個${unit}`, 'api-chain-more'));
    return box;
  };

  /** Screen → trigger → API → handler → Service → DAO, six equal columns; each node with a source copies it. */
  const renderChain = (record: ApiRecord) => {
    const card = element('section', undefined, 'api-card api-chain-card');
    card.dataset.apiSection = 'chain';
    card.append(element('h2', '呼叫鏈：從畫面一路到資料表'));
    const screens = chainScreens(index, record.callers);
    const screenCells: Cell[] = screens.map((item) => {
      const node = index.nodes.get(item.screenId),
        role =
          roles && tintOf(item.screenId) !== 'none'
            ? roles.label(roles.of.get(item.screenId)!)
            : '';
      return {
        label: role ? `畫面 · ${role}` : '畫面',
        name: name(item.screenId),
        sub: index.routes.get(item.screenId)?.[0],
        subMono: true,
        source: location(node?.source),
        kind: 'screen',
        screenId: item.screenId,
        removed:
          screenDecision(state, item.screenId) === 'REMOVE' ||
          record.callers.filter((c) => c.screenId === item.screenId).every(removed),
        title: item.triggers.join('、'),
      };
    });
    const triggerCells: Cell[] = [];
    const seen = new Set<string>();
    for (const caller of withoutSubmittedForms(record.callers)) {
      const source = triggerSource(caller),
        key = caller.componentId
          ? location(source) || caller.componentId
          : `${caller.screenId}|${caller.behaviorId || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      triggerCells.push({
        label: `觸發 · ${triggerKind(caller)}`,
        name: triggerText(caller),
        sub: shortLocation(source),
        subMono: true,
        source: location(source),
        unproven: !caller.componentId && callerKind(index, caller) === 'unresolved',
        removed: removed(caller),
        title: `${name(caller.screenId)}：${callerLabel(index, caller)}`,
      });
    }
    const empty = (label: string, text: string): Cell => ({ label, name: text, unproven: true });
    const contract = (index.graph.apiContracts || []).find((c) => c.endpointId === record.node.id);
    const apiSource = record.node.source?.file ? record.node.source : contract?.source;
    const apiCell: Cell = {
      label: 'API',
      name: `${record.method === 'ANY' ? '任何' : record.method} ${record.path}`,
      mono: true,
      source: location(apiSource),
      kind: 'api',
    };
    const handlerCells: Cell[] = record.handlers.map((handler) => ({
      label: '處理程式',
      name: handler.name,
      mono: true,
      sub: shortLocation(handler.source),
      subMono: true,
      source: location(handler.source),
    }));
    // The handlers' own calls into the project's services and DAOs, as the analysis proved them (ADR 0156, 0189).
    const calls = record.handlers
      .flatMap((handler) => backendCalls(handler))
      .sort((a, b) => a.depth - b.depth || (a.to < b.to ? -1 : a.to > b.to ? 1 : 0))
      .filter((call, i, all) => all.findIndex((c) => c.to === call.to) === i);
    const callCells = (layers: string[], label: string): Cell[] =>
      calls
        .filter((call) => layers.includes(call.layer))
        .map((call) => ({
          label,
          name: call.to,
          mono: true,
          sub: shortLocation(call.source),
          subMono: true,
          source: location(call.source),
          unproven: call.resolution !== 'CONFIRMED',
          title: `${call.from} → ${call.to}（第 ${call.depth} 層・${call.resolution}${call.reason ? `：${call.reason}` : ''}）`,
        }));
    const services = callCells(['SERVICE'], 'Service'),
      daos = callCells(['DAO', 'REPOSITORY'], 'DAO');
    const grid = element('div', undefined, 'api-chain-grid'),
      scroll = element('div', undefined, 'api-chain-scroll');
    grid.setAttribute('role', 'group');
    grid.setAttribute(
      'aria-label',
      `呼叫鏈：${screens.length ? `${screens.length} 個畫面` : '沒有呼叫來源'} → ${record.method} ${record.path} → ${record.handlers.length ? `${record.handlers.length} 個處理程式` : NO_HANDLER}`,
    );
    grid.append(
      column('screens', screenCells.length ? screenCells : [empty('畫面', '沒有呼叫來源')], '畫面'),
      column(
        'triggers',
        triggerCells.length ? triggerCells : [empty('觸發', '沒有呼叫來源')],
        '觸發',
      ),
      column('api', [apiCell], 'API'),
      column(
        'handlers',
        handlerCells.length ? handlerCells : [empty('處理程式', NO_HANDLER)],
        '處理程式',
      ),
      column(
        'service',
        services.length ? services : [empty('Service', '沒有可證明的呼叫')],
        '呼叫',
      ),
      column('dao', daos.length ? daos : [empty('DAO', '沒有可證明的呼叫')], '呼叫'),
    );
    // One node per column: the nodes share the row's height, as one line across the card.
    if ([...grid.children].every((col) => col.childElementCount === 1))
      grid.dataset.singleRow = 'true';
    scroll.append(grid);
    card.append(
      scroll,
      element(
        'p',
        '每一格都附原始碼位置，點擊可複製路徑。靜態分析無法證明的環節以虛線呈現，不猜測。',
        'api-chain-note',
      ),
    );
    return card;
  };
  const section = (heading: string) => {
    const box = element('section', undefined, 'api-card api-section');
    box.append(element('h2', heading));
    return box;
  };

  /** A calling screen's card: a header strip that opens the screen, then the triggers on it. */
  const screenCard = (screenId: string, heading?: string) => {
    const card = element('div', undefined, 'api-caller-screen'),
      link = element('button', undefined, 'api-screen-link');
    tint(card, screenId);
    link.type = 'button';
    link.dataset.callerScreen = screenId;
    link.title = `開啟畫面「${name(screenId)}」`;
    const label = element('span', undefined, 'api-screen-text');
    label.append(element('strong', heading || name(screenId)));
    const url = index.routes.get(screenId)?.[0];
    if (url) label.append(element('code', url));
    link.append(label, element('span', '開啟畫面 →', 'api-screen-open'));
    link.onclick = () => options.onCaller(screenId);
    if (screenDecision(state, screenId) === 'REMOVE') card.classList.add('is-removed');
    const body = element('div', undefined, 'api-caller-list');
    card.append(link, body);
    return { card, body };
  };
  /** One trigger line: its kind tag, its words, and the screen's (or the trigger's) current mark. */
  const triggerLine = (caller: Caller) => {
    const line = element('button', undefined, 'api-caller');
    line.type = 'button';
    line.dataset.callerScreen = caller.screenId;
    if (caller.componentId) line.dataset.callerComponent = caller.componentId;
    line.title = `${triggerKind(caller)}：${callerLabel(index, caller)}`;
    const mark =
      caller.componentId &&
      componentDecision(state, caller.screenId, caller.componentId) === 'REMOVE'
        ? '· 已標記移除'
        : `· 畫面${decisionLabel(effectiveScreen(index.graph, state, caller.screenId))}`;
    line.append(
      element('span', triggerKind(caller), 'api-caller-kind'),
      element('span', triggerText(caller), 'api-caller-label'),
      element('span', mark, 'api-caller-mark'),
    );
    if (removed(caller)) line.classList.add('is-removed');
    line.onclick = () => options.onCaller(caller.screenId, caller.componentId);
    return line;
  };

  const renderCallers = (record: ApiRecord) => {
    const box = section(`呼叫來源 · ${record.screens} 個畫面`);
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
    const byName = (a: string, b: string) => name(a).localeCompare(name(b), 'zh-Hant');
    // A shared form whose own submit button is also shared is the same action: keep the button.
    const sharedForms = new Set(
      record.callers
        .filter((c) => c.componentId && isShared(c))
        .map((c) => index.nodes.get(c.componentId!)?.attributes.formId)
        .filter((id): id is string => !!id),
    );
    const isSharedForm = (key: string) =>
      record.callers.some(
        (c) => sharedKey(c) === key && !!c.componentId && sharedForms.has(c.componentId),
      );
    for (const [key, screens] of [...screensOf]
      .filter(([key]) => shared.has(key) && !isSharedForm(key))
      .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0], 'en'))) {
      const callers = record.callers.filter((c) => sharedKey(c) === key),
        first = callers[0],
        component = first.componentId ? index.nodes.get(first.componentId) : undefined;
      // Styled like a screen card: the header names the shared trigger, the lines are the screens it is on.
      const card = element('div', undefined, 'api-caller-screen api-shared'),
        header = element('div', undefined, 'api-screen-link is-static'),
        label = element('span', undefined, 'api-screen-text');
      card.dataset.apiShared = key;
      label.append(
        element(
          'strong',
          component
            ? `共用${triggerKind(first)}「${triggerText(first)}」`
            : `${callerLabel(index, first)}（共用程式）`,
        ),
      );
      const where = location(component?.source);
      if (where) label.append(element('code', where));
      header.append(label, element('span', `${screens.size} 個畫面`, 'api-screen-open is-count'));
      const body = element('div', undefined, 'api-caller-list');
      const perScreen = new Map<string, Caller>();
      for (const caller of callers)
        if (!perScreen.has(caller.screenId)) perScreen.set(caller.screenId, caller);
      for (const [screenId, caller] of [...perScreen].sort((a, b) => byName(a[0], b[0]))) {
        const line = element('button', undefined, 'api-caller');
        line.type = 'button';
        line.dataset.callerScreen = screenId;
        if (caller.componentId) line.dataset.callerComponent = caller.componentId;
        line.append(
          element('span', '畫面', 'api-caller-kind'),
          element('span', name(screenId), 'api-caller-label'),
          element(
            'span',
            `· 畫面${decisionLabel(effectiveScreen(index.graph, state, screenId))}`,
            'api-caller-mark',
          ),
        );
        if (removed(caller)) line.classList.add('is-removed');
        line.onclick = () => options.onCaller(screenId, caller.componentId);
        body.append(line);
      }
      card.append(header, body);
      box.append(card);
    }
    for (const [screenId, callers] of [...own].sort((a, b) => byName(a[0], b[0]))) {
      const { card, body } = screenCard(screenId);
      for (const caller of withoutSubmittedForms(callers)) body.append(triggerLine(caller));
      box.append(card);
    }
    return box;
  };
  type Field = { name?: unknown; type?: unknown };
  type Body = { contentType?: unknown; bodyType?: unknown; fields?: unknown; status?: unknown };
  const text = (value: unknown) =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  /** Request fields with the screen field proven to feed each one (「—」 when none is proven). */
  const fieldTable = (fields: Field[], sources: Map<string, string[]>) => {
    const table = element('div', undefined, 'api-fields');
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', 'Request 欄位');
    const cell = (value: string, className: string, role = 'cell') => {
      const item = element('span', value, className);
      item.setAttribute('role', role);
      return item;
    };
    for (const label of ['欄位', '型別', '來自畫面欄位'])
      table.append(cell(label, 'api-fields-head', 'columnheader'));
    for (const field of fields) {
      const from = sources.get(text(field.name));
      table.append(
        cell(text(field.name), 'api-fields-cell is-mono'),
        cell(text(field.type), 'api-fields-cell is-mono'),
        cell(from?.length ? from.join('、') : '—', 'api-fields-cell'),
      );
    }
    return table;
  };
  const renderContract = (record: ApiRecord) => {
    const box = section('Request ／ Response');
    box.dataset.apiSection = 'contract';
    const contract = (index.graph.apiContracts || []).find((c) => c.endpointId === record.node.id);
    if (!contract) {
      box.append(element('p', '沒有分析到 Request／Response。', 'muted'));
      return box;
    }
    const request = (contract.request || {}) as Body,
      responses = (Array.isArray(contract.responses) ? contract.responses : []) as Body[],
      fields = Array.isArray(request.fields) ? (request.fields as Field[]) : [];
    const requestType = [text(request.bodyType), text(request.contentType)].filter(Boolean);
    if (requestType.length) {
      const line = element('span', 'Request ', 'api-contract-line');
      line.append(element('code', requestType.join(' · ')));
      box.append(line);
    }
    if (fields.length) box.append(fieldTable(fields, requestFieldSources(index, record.node.id)));
    else box.append(element('p', 'Request 沒有分析到欄位。', 'muted'));
    if (!responses.length) box.append(element('p', '沒有分析到回應。', 'muted'));
    for (const response of responses) {
      const summary = responseSummary(
          text(response.status),
          text(response.bodyType),
          text(response.contentType),
        ),
        line = element('span', '回應 ', 'api-contract-line');
      if (summary.type) line.append(element('code', summary.type));
      if (summary.outcome) line.append(`${summary.type ? ' · ' : ''}${summary.outcome}`);
      box.append(line);
    }
    return box;
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
    // The title row: method, path and status, what the API is for right below, the decision on the right.
    const title = element('div', undefined, 'api-detail-title'),
      heading = element('div', undefined, 'api-detail-heading'),
      line = element('div', undefined, 'api-detail-line'),
      path = element('h1', record.path, 'api-detail-path');
    line.append(
      methodBadge(record.method),
      path,
      statusTag(record.status, record.external.length > 0),
    );
    heading.append(line);
    title.append(heading);
    inner.append(title);
    const purpose = apiPurpose(index, record.callers, record.external.length > 0);
    if (purpose) {
      const sentence = element('p', purpose.sentence, 'api-purpose');
      sentence.dataset.apiPurpose = 'true';
      heading.append(sentence);
    }
    // 「N 個畫面會呼叫這個 API」 repeats the callers below; other statuses keep their warning.
    if (record.status !== 'IN_USE' || record.note) {
      const why = element('p', reason(record), record.note ? 'api-reason api-note' : 'api-reason');
      why.dataset.apiStatus = record.status;
      heading.append(why);
    }
    if (options.setApi) {
      // The person's own decision on this API sits at the end of its title row; a conflict follows right under it.
      const id = record.node.id,
        direct = apiDecision(state, id);
      const decision = element('div', undefined, 'api-title-decision');
      decision.dataset.apiDecisionFor = id;
      decision.append(
        decisionSwitch(`這個 API`, direct, (value) => options.setApi!(id, value), {
          screen: `api:${id}`,
        }),
      );
      title.append(decision);
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
        inner.append(note);
      }
    }
    inner.append(renderChain(record));
    // Callers on the left, request and response on the right; one column when narrow.
    const columns = element('div', undefined, 'api-detail-columns');
    columns.append(renderCallers(record), renderContract(record));
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
      inner.append(box);
    }
    const changed = changesSection(record.handlers);
    if (changed) inner.append(changed);
    detail.append(inner);
    detail.scrollTop = 0;
  };

  renderList();
  return root;
}
