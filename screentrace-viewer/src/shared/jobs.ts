import { Graph, Node, Source } from '../contracts';

/** How code without a screen starts (ADR 0159). */
export type JobTrigger = 'SCHEDULE' | 'EVENT' | 'STARTUP' | 'ASYNC';
export const jobTriggerLabels: Record<JobTrigger, string> = {
  SCHEDULE: '排程',
  EVENT: '事件',
  STARTUP: '啟動時',
  ASYNC: '非同步',
};
const TRIGGER_ORDER: JobTrigger[] = ['SCHEDULE', 'EVENT', 'STARTUP', 'ASYNC'];

export interface JobPublisher {
  from: string;
  source?: Source;
}
export interface BackgroundJob {
  node: Node;
  trigger: JobTrigger;
  /** When it runs, in words; it may say the timing cannot be determined. */
  text: string;
  /** The annotations or declaration it was read from, as written. */
  expression: string;
  note?: string;
  property?: string;
  eventType?: string;
  publishers: JobPublisher[];
}

const publishersOf = (node: Node): JobPublisher[] => {
  const raw = node.attributes.eventPublishers;
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (p): p is JobPublisher => !!p && typeof p === 'object' && typeof p.from === 'string',
    );
  } catch {
    return [];
  }
};

/** Handlers the analysis found starting on a schedule, an event or at startup, in a stable order. */
export function backgroundJobs(graph: Graph): BackgroundJob[] {
  return graph.nodes
    .filter(
      (n) =>
        n.type === 'HANDLER' &&
        TRIGGER_ORDER.includes(n.attributes.trigger as JobTrigger) &&
        typeof n.attributes.triggerText === 'string',
    )
    .map((node) => ({
      node,
      trigger: node.attributes.trigger as JobTrigger,
      text: node.attributes.triggerText,
      expression: node.attributes.triggerExpression || '',
      note: node.attributes.triggerNote || undefined,
      property: node.attributes.triggerProperty || undefined,
      eventType: node.attributes.eventType || undefined,
      publishers: publishersOf(node),
    }))
    .sort(
      (a, b) =>
        TRIGGER_ORDER.indexOf(a.trigger) - TRIGGER_ORDER.indexOf(b.trigger) ||
        (a.node.name < b.node.name ? -1 : a.node.name > b.node.name ? 1 : 0) ||
        (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0),
    );
}
