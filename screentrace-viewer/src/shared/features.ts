import { Graph, Node, Source } from '../contracts';
import { indexGraph, Index } from '../map';

/**
 * Features: screens grouped by deterministic rules over facts already in the graph (ADR 0156).
 * Nothing is guessed: each feature names the rule and the value that put its screens together,
 * with the source of that value. A screen no rule groups with another screen goes to 其他.
 */
export type FeatureRule = 'MODULE' | 'HANDLER_CLASS' | 'TILES' | 'MENU' | 'URL' | 'ROLE' | 'OTHER';
export interface FeatureFlow {
  /** The screen the flow starts from: no other screen of the feature leads to it (or, in a loop, the first by name). */
  entry: string;
  /** Screens in the order navigation reaches them from the entry; each screen belongs to one flow. */
  screens: string[];
}
export interface Feature {
  /** Stable across analyses of the same project: the rule and its value, e.g. `url:/owners`. */
  key: string;
  rule: FeatureRule;
  value: string;
  label: string;
  /** Where the value comes from (a handler, a Tiles definition, a screen route), at most a few. */
  sources: Source[];
  screens: string[];
  flows: FeatureFlow[];
}
export const OTHER_FEATURE = 'other';
export const ruleLabels: Record<FeatureRule, string> = {
  MODULE: 'Struts module',
  HANDLER_CLASS: '處理程式類別',
  TILES: 'Tiles 定義名稱前綴',
  MENU: '選單',
  URL: '網址前綴',
  ROLE: '只有一個角色會用到',
  OTHER: '沒有可共用的分組依據',
};
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byName = (index: Index) => (a: string, b: string) =>
  order(index.nodes.get(a)?.name || '', index.nodes.get(b)?.name || '') || order(a, b);

const segments = (route: string) =>
  route
    .split(/[?#]/)[0]
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/\.[a-z0-9]+$/i, ''));
const dynamic = (part: string) =>
  part.startsWith(':') || part.startsWith('{') || part.includes('*') || part.includes('$');
const simpleName = (type: string) => type.split(/[.$]/).pop() || type;
/** A class name read as a feature: `OwnerController` → `Owner`; a bare suffix keeps its name. */
const classLabel = (type: string) =>
  simpleName(type).replace(/(?:Dispatch)?(?:Controller|Action)$/, '') || simpleName(type);

/** Handlers that render or forward to each screen. */
function screenHandlers(index: Index): Map<string, Node[]> {
  const result = new Map<string, Node[]>();
  for (const edge of index.graph.relationships || []) {
    if (edge.type !== 'RENDERS' && edge.type !== 'FORWARDS_TO') continue;
    const from = index.nodes.get(edge.from);
    if (from?.type !== 'HANDLER' || index.nodes.get(edge.to)?.type !== 'SCREEN') continue;
    const list = result.get(edge.to) || [];
    if (!list.includes(from)) list.push(from);
    result.set(edge.to, list);
  }
  return result;
}
const handlerClass = (handler: Node) =>
  handler.attributes.class || handler.attributes.actionType || '';

interface Candidate {
  rule: FeatureRule;
  value: string;
  label: string;
  source?: Source;
}
/** Every rule's value for every screen; a rule only groups when two or more screens share its value. */
function candidates(index: Index): Map<string, Candidate[]> {
  const handlers = screenHandlers(index),
    result = new Map<string, Candidate[]>(index.screens.map((s) => [s.id, []]));
  const modules = new Set<string>();
  for (const list of handlers.values())
    for (const h of list) if (h.attributes.module) modules.add(h.attributes.module);
  for (const screen of index.screens) {
    const list = result.get(screen.id)!,
      own = (handlers.get(screen.id) || []).slice().sort((a, b) => order(a.id, b.id));
    // A module only says something when the project has more than one.
    if (modules.size > 1) {
      const values = [...new Set(own.map((h) => h.attributes.module).filter(Boolean))].sort(order);
      if (values.length === 1) {
        const h = own.find((x) => x.attributes.module === values[0])!;
        list.push({ rule: 'MODULE', value: values[0], label: values[0], source: h.source });
      }
    }
    for (const type of [...new Set(own.map(handlerClass).filter(Boolean))].sort(order)) {
      const h = own.find((x) => handlerClass(x) === type)!;
      list.push({ rule: 'HANDLER_CLASS', value: type, label: classLabel(type), source: h.source });
    }
    const tiles = screen.attributes.tilesDefinitionName || '';
    if (tiles.includes('.')) {
      const prefix = tiles.slice(0, tiles.lastIndexOf('.'));
      list.push({ rule: 'TILES', value: prefix, label: prefix, source: screen.source });
    }
  }
  // A menu: links rendered from one element (a list of items) that lead to two or more screens (ADR 0164).
  const menus = new Map<
    string,
    { targets: Set<string>; labels: [number, string][]; source: Source }
  >();
  // An item's place in its list, from the `[n]` of its expansion anchor; unknown places sort last.
  const place = (link: Node) => {
    const found = [...(link.attributes.expansionAnchor || '').matchAll(/\[(\d+)\]/g)].at(-1);
    return found ? Number(found[1]) : Number.MAX_SAFE_INTEGER;
  };
  for (const relation of index.relations) {
    if (relation.from === relation.to) continue;
    for (const trigger of relation.triggers) {
      const link = index.nodes.get(trigger);
      if (link?.type !== 'COMPONENT' || link.attributes.kind !== 'LINK' || !link.source?.file)
        continue;
      const value = `${link.source.file}:${link.source.line}`,
        menu = menus.get(value) || { targets: new Set(), labels: [], source: link.source };
      menu.targets.add(relation.to);
      if (link.name && !/^<.*>$/.test(link.name) && !menu.labels.some(([, l]) => l === link.name))
        menu.labels.push([place(link), link.name]);
      menus.set(value, menu);
    }
  }
  for (const [value, menu] of [...menus].sort(([a], [b]) => order(a, b))) {
    if (menu.targets.size < 2) continue;
    const labels = menu.labels
      .slice()
      .sort((a, b) => a[0] - b[0] || order(a[1], b[1]))
      .map(([, l]) => l);
    const label = labels.length
      ? `選單：${labels.slice(0, 3).join('、')}${labels.length > 3 ? ' 等' : ''}`
      : `選單：${value}`;
    for (const id of [...menu.targets].sort(order))
      result.get(id)?.push({ rule: 'MENU', value, label, source: menu.source });
  }
  // The one role a screen is for, from the analysis's personas (ADR 0177).
  for (const persona of (index.graph.application.personas || []) as {
    id?: string;
    name?: string;
    screens?: Record<string, string>;
  }[]) {
    if (!persona.id || !persona.name) continue;
    for (const [id, status] of Object.entries(persona.screens || {})) {
      if (status !== 'APPLIES' || !result.has(id)) continue;
      const others = (index.graph.application.personas || []) as {
        id?: string;
        screens?: Record<string, string>;
      }[];
      if (others.some((p) => p.id !== persona.id && p.screens?.[id] === 'APPLIES')) continue;
      result.get(id)!.push({
        rule: 'ROLE',
        value: persona.id,
        label: `${persona.name}專用`,
        source: index.nodes.get(id)?.source,
      });
    }
  }
  // The URL area: the first path segment that tells screens apart (a shared context path is skipped).
  const routes = new Map(
    index.screens.map((s) => [s.id, segments(index.routes.get(s.id)?.[0] || '')]),
  );
  let depth = 0;
  for (; depth < 4; depth++) {
    const first = new Set([...routes.values()].map((parts) => parts[depth]));
    if (first.size !== 1 || first.has(undefined as unknown as string)) break;
  }
  for (const [id, parts] of routes) {
    const part = parts[depth];
    if (!part || dynamic(part)) continue;
    const value = '/' + parts.slice(0, depth + 1).join('/');
    result.get(id)!.push({
      rule: 'URL',
      value,
      label: value,
      source: index.nodes.get(id)?.source,
    });
  }
  return result;
}

const RULES: FeatureRule[] = ['MODULE', 'HANDLER_CLASS', 'TILES', 'MENU', 'URL', 'ROLE'];

/** The grouping rules a list of features actually used, in priority order, for the description. */
export function usedRules(list: Feature[]): FeatureRule[] {
  return RULES.filter((rule) => list.some((f) => f.rule === rule));
}

/** Navigation inside one feature, followed from its entry screens. */
function flows(index: Index, members: string[]): FeatureFlow[] {
  const inside = new Set(members),
    sort = byName(index),
    next = new Map<string, string[]>(),
    inbound = new Map<string, number>(members.map((id) => [id, 0]));
  for (const r of index.relations)
    if (inside.has(r.from) && inside.has(r.to) && r.from !== r.to) {
      const list = next.get(r.from) || [];
      if (!list.includes(r.to)) list.push(r.to);
      next.set(r.from, list);
      inbound.set(r.to, inbound.get(r.to)! + 1);
    }
  const visited = new Set<string>(),
    result: FeatureFlow[] = [];
  const walk = (entry: string) => {
    const queue = [entry],
      screens: string[] = [];
    visited.add(entry);
    while (queue.length) {
      const id = queue.shift()!;
      screens.push(id);
      for (const to of (next.get(id) || []).slice().sort(sort))
        if (!visited.has(to)) {
          visited.add(to);
          queue.push(to);
        }
    }
    result.push({ entry, screens });
  };
  for (const id of members.filter((m) => !inbound.get(m)).sort(sort)) walk(id);
  // Screens only reachable inside a loop start their own flow, first by name.
  for (const id of members.slice().sort(sort)) if (!visited.has(id)) walk(id);
  return result;
}

/** Features of the analysed application, by rule priority: module, handler class, Tiles prefix, URL prefix. */
export function features(input: Graph | Index): Feature[] {
  const index = 'owners' in input ? input : indexGraph(input);
  const all = candidates(index),
    counts = new Map<string, number>();
  const key = (c: Candidate) => `${c.rule}\u0000${c.value}`;
  for (const list of all.values())
    for (const c of new Map(list.map((x) => [key(x), x])).values())
      counts.set(key(c), (counts.get(key(c)) || 0) + 1);
  const chosen = new Map<string, Candidate | undefined>();
  for (const screen of index.screens) {
    const list = all.get(screen.id)!;
    let pick: Candidate | undefined;
    for (const rule of RULES) {
      // Of several values for one rule (two handler classes), the one most screens share, then by value.
      const shared = list
        .filter((c) => c.rule === rule && (counts.get(key(c)) || 0) > 1)
        .sort((a, b) => counts.get(key(b))! - counts.get(key(a))! || order(a.value, b.value));
      if (shared.length) {
        pick = shared[0];
        break;
      }
    }
    chosen.set(screen.id, pick);
  }
  // A value other screens took a higher rule for can leave one screen alone: that is no feature either.
  const chosenCounts = new Map<string, number>();
  for (const c of chosen.values())
    if (c) chosenCounts.set(key(c), (chosenCounts.get(key(c)) || 0) + 1);
  for (const [screenId, c] of chosen)
    if (c && chosenCounts.get(key(c))! < 2) chosen.set(screenId, undefined);
  // A screen left out joins the feature of its siblings: versions of the same route first (a query or
  // a wizard step), then screens drawn by the same page component (ADR 0169).
  // Versions by audience (signed out / signed in) on one URL are different screens to people, so
  // only a query or page-state version follows its route; a redirect-only route has no page of its own.
  const attrs = (id: string) => index.nodes.get(id)?.attributes || {};
  const siblingKeys: ((id: string) => string | undefined)[] = [
    (id) =>
      attrs(id).entryQuery || attrs(id).stateVariant ? index.routes.get(id)?.[0] : undefined,
    (id) => (attrs(id).redirectTargets === undefined ? attrs(id).view || undefined : undefined),
  ];
  for (const siblingKey of siblingKeys) {
    const joined = new Map<string, Candidate>();
    for (const screen of index.screens) {
      if (chosen.get(screen.id)) continue;
      const own = siblingKey(screen.id);
      if (!own) continue;
      const votes = new Map<string, { candidate: Candidate; count: number }>();
      for (const other of index.screens) {
        const c = chosen.get(other.id);
        const otherKey =
          siblingKey === siblingKeys[0] ? index.routes.get(other.id)?.[0] : siblingKey(other.id);
        if (!c || other.id === screen.id || otherKey !== own) continue;
        const vote = votes.get(key(c)) || { candidate: c, count: 0 };
        vote.count++;
        votes.set(key(c), vote);
      }
      const best = [...votes.entries()].sort(
        (a, b) => b[1].count - a[1].count || order(a[0], b[0]),
      )[0];
      if (best) joined.set(screen.id, best[1].candidate);
    }
    for (const [id, c] of joined) chosen.set(id, c);
  }
  // A screen still left out that only one role uses joins the feature most of that role's other
  // screens are in (ADR 0178): a role's own pages stay together, and nothing crosses roles.
  const peers = new Map<string, Candidate>();
  for (const screen of index.screens) {
    if (chosen.get(screen.id)) continue;
    const role = all.get(screen.id)!.find((c) => c.rule === 'ROLE');
    if (!role) continue;
    const votes = new Map<string, { candidate: Candidate; count: number }>();
    for (const other of index.screens) {
      const c = chosen.get(other.id);
      if (!c || !all.get(other.id)!.some((x) => key(x) === key(role))) continue;
      const vote = votes.get(key(c)) || { candidate: c, count: 0 };
      vote.count++;
      votes.set(key(c), vote);
    }
    const best = [...votes.entries()].sort(
      (a, b) => b[1].count - a[1].count || order(a[0], b[0]),
    )[0];
    if (best) peers.set(screen.id, best[1].candidate);
  }
  for (const [id, c] of peers) chosen.set(id, c);
  const groups = new Map<string, { candidate?: Candidate; screens: string[]; sources: Source[] }>();
  for (const [screenId, c] of chosen) {
    const k = c
      ? `${c.rule === 'HANDLER_CLASS' ? 'class' : c.rule.toLowerCase()}:${c.value}`
      : OTHER_FEATURE;
    const group = groups.get(k) || { candidate: c, screens: [], sources: [] };
    group.screens.push(screenId);
    if (
      c?.source &&
      !group.sources.some((s) => s.file === c.source!.file && s.line === c.source!.line)
    )
      group.sources.push(c.source);
    groups.set(k, group);
  }
  const sort = byName(index);
  return [...groups]
    .map(([k, g]) => ({
      key: k,
      rule: g.candidate?.rule || 'OTHER',
      value: g.candidate?.value || '',
      label: g.candidate?.label || '其他',
      sources: g.sources.sort((a, b) => order(a.file, b.file) || a.line - b.line).slice(0, 5),
      screens: g.screens.sort(sort),
      flows: flows(index, g.screens),
    }))
    .sort(
      (a, b) =>
        Number(a.key === OTHER_FEATURE) - Number(b.key === OTHER_FEATURE) ||
        order(a.label, b.label) ||
        order(a.key, b.key),
    );
}

/** Which feature each screen belongs to. */
export function featureOfScreen(list: Feature[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const feature of list) for (const id of feature.screens) result.set(id, feature.key);
  return result;
}
