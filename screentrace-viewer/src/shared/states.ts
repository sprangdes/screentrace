import { Graph, Node, Source } from '../contracts';

/** One proven write of an enum value, as the Java analysis attached it to a handler (ADR 0160). */
export interface StateChange {
  depth: number;
  in: string;
  enum: string;
  field: string;
  /** Absent when the value comes from a variable. */
  value?: string;
  label?: string;
  labelSource?: Source;
  values?: string[];
  labels?: Record<string, string>;
  resolution: string;
  reason?: string;
  source?: Source;
  /** The values it may have had before, inferred from conditions around the write (ADR 0169). */
  from?: string[];
  fromNot?: string[];
  fromCreated?: boolean;
  fromLines?: number[];
  /** Only some ways into the write say the prior value; the others say nothing (ADR 0178). */
  fromPartial?: boolean;
  /** Every word the frontend uses for the value when it uses more than one (ADR 0170). */
  labelWords?: { text: string; source?: Source }[];
}

/** Who makes a write happen: an API (through its handler) or a background job. */
export interface StateWriter {
  handler: Node;
  endpoints: Node[];
  change: StateChange;
}
export interface StateValue {
  value: string;
  label?: string;
  words?: { text: string; source?: Source }[];
  writers: StateWriter[];
}
export interface StateType {
  name: string;
  fields: string[];
  values: StateValue[];
  /** Writes whose value the analysis could not determine. */
  unresolved: StateWriter[];
}

/** State changes a handler makes; anything malformed is left out, never guessed at. */
export function stateChanges(handler: Node): StateChange[] {
  const raw = handler.attributes.stateChanges;
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (c): c is StateChange =>
        !!c &&
        typeof c === 'object' &&
        typeof c.enum === 'string' &&
        typeof c.field === 'string' &&
        typeof c.in === 'string' &&
        typeof c.resolution === 'string' &&
        (c.value === undefined || typeof c.value === 'string'),
    );
  } catch {
    return [];
  }
}

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A constant with the frontend's word for it, when there is one: `已取消（CANCELLED）`. */
export const stateLabel = (value: string, label?: string) =>
  label ? `${label}（${value}）` : value;

const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : undefined;

/** The value before the write, in words; undefined when the conditions say nothing. Always a guess. */
export function priorText(change: StateChange): string | undefined {
  const word = (v: string) => stateLabel(v, change.labels?.[v]);
  const from = strings(change.from),
    not = strings(change.fromNot);
  if (change.fromCreated === true) return '新建立';
  if (from?.length)
    return `${from.map(word).join(' 或 ')}${change.fromPartial === true ? '，或其他推不出的狀態' : ''}`;
  if (not?.length) return `不是 ${not.map(word).join('、')}`;
  return undefined;
}

/** Every enum some handler writes, its constants in declaration order and who sets each one. */
export function stateTypes(graph: Graph): StateType[] {
  const endpointsOf = new Map<string, Node[]>(),
    nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const edge of graph.relationships || [])
    if (edge.type === 'HANDLED_BY' && nodes.get(edge.from)?.type === 'ENDPOINT')
      endpointsOf.set(edge.to, [...(endpointsOf.get(edge.to) || []), nodes.get(edge.from)!]);
  const types = new Map<string, StateType & { byValue: Map<string, StateValue> }>();
  for (const handler of graph.nodes
    .filter((n) => n.type === 'HANDLER')
    .sort((a, b) => order(a.id, b.id)))
    for (const change of stateChanges(handler)) {
      let type = types.get(change.enum);
      if (!type) {
        type = { name: change.enum, fields: [], values: [], unresolved: [], byValue: new Map() };
        types.set(change.enum, type);
      }
      for (const value of change.values || [])
        if (!type.byValue.has(value)) {
          const entry: StateValue = { value, label: change.labels?.[value], writers: [] };
          type.byValue.set(value, entry);
          type.values.push(entry);
        }
      if (!type.fields.includes(change.field)) type.fields.push(change.field);
      const writer = {
        handler,
        endpoints: [...(endpointsOf.get(handler.id) || [])].sort((a, b) => order(a.name, b.name)),
        change,
      };
      if (change.value === undefined) {
        type.unresolved.push(writer);
        continue;
      }
      let entry = type.byValue.get(change.value);
      if (!entry) {
        entry = { value: change.value, label: change.label, writers: [] };
        type.byValue.set(change.value, entry);
        type.values.push(entry);
      }
      if (!entry.words && Array.isArray(change.labelWords))
        entry.words = change.labelWords.filter(
          (w) => !!w && typeof w === 'object' && typeof w.text === 'string',
        );
      entry.writers.push(writer);
    }
  return [...types.values()]
    .map((type) => ({
      name: type.name,
      fields: type.fields.sort(order),
      values: type.values,
      unresolved: type.unresolved,
    }))
    .sort((a, b) => order(a.name, b.name));
}

export interface StateTransition {
  /** Undefined for a newly created object. */
  from?: string;
  to: string;
  writers: StateWriter[];
  /** Some writer of this pair also has other ways in whose prior value is unknown. */
  partial?: boolean;
}
/**
 * The inferred transitions of one state (ADR 0176): every write whose prior values are known, as
 * from → to, in the order the values are declared; a newly created object starts from nothing.
 */
export function stateTransitions(type: StateType): StateTransition[] {
  const order = new Map(type.values.map((v, i) => [v.value, i]));
  const byPair = new Map<string, StateTransition>();
  for (const value of type.values)
    for (const writer of value.writers) {
      const change = writer.change;
      const froms = change.fromCreated === true ? [undefined] : (change.from ?? []);
      for (const from of froms) {
        const key = `${from ?? ''}\u0000${value.value}`;
        const item = byPair.get(key) || { from, to: value.value, writers: [] };
        if (!item.writers.includes(writer)) item.writers.push(writer);
        if (change.fromPartial === true && from !== undefined) item.partial = true;
        byPair.set(key, item);
      }
    }
  const rank = (v?: string) => (v === undefined ? -1 : (order.get(v) ?? Number.MAX_SAFE_INTEGER));
  return [...byPair.values()].sort(
    (a, b) => rank(a.from) - rank(b.from) || rank(a.to) - rank(b.to),
  );
}
