import { Index } from './map';
import { fieldComponents } from './shared/review';
import { componentLabelsForScreen, kindNames } from './labels';

/**
 * The screen fields proven to feed each request field of an API, by request field name. Same rule as the
 * review md's §10 資料欄位對照: an input field (or its form) is the trigger of a SUBMIT_FORM / CALL_API
 * behavior on this API, and its field name (or the name before `.` / `[`) equals the request field's name.
 * A request field without such a screen field is left out; the page shows 「—」 rather than guess.
 */
export function requestFieldSources(index: Index, endpointId: string): Map<string, string[]> {
  const graph = index.graph,
    result = new Map<string, string[]>();
  const contract = (graph.apiContracts || []).find((c) => c.endpointId === endpointId);
  const request = (contract?.request || {}) as { fields?: unknown };
  const names = (Array.isArray(request.fields) ? request.fields : [])
    .map((f) => (f && typeof f === 'object' ? (f as { name?: unknown }).name : undefined))
    .filter((n): n is string => typeof n === 'string' && !!n);
  if (!names.length) return result;
  const behaviors = (graph.behaviors || []).filter(
    (b) => ['SUBMIT_FORM', 'CALL_API'].includes(b.type) && b.targetId === endpointId,
  );
  if (!behaviors.length) return result;
  const triggers = new Set(behaviors.map((b) => b.triggerId).filter(Boolean));
  for (const key of fieldComponents(graph)) {
    const component = index.nodes.get(key.componentId);
    if (!component) continue;
    const form = component.attributes.formId;
    if (!triggers.has(component.id) && !(form && triggers.has(form))) continue;
    const name =
      component.attributes.field ||
      component.attributes.name ||
      component.attributes.property ||
      '';
    if (!name) continue;
    const base = name.split(/[.[]/)[0];
    const label = fieldLabel(index, key.screenId, key.componentId);
    for (const field of names)
      if (field === name || field === base) {
        const list = result.get(field) || [];
        if (!list.includes(label)) list.push(label);
        result.set(field, list);
      }
  }
  return result;
}

/** A field component's label on its screen, without the kind word the screen panel appends. */
function fieldLabel(index: Index, screenId: string, componentId: string): string {
  const component = index.nodes.get(componentId),
    kind = kindNames[component?.attributes.kind || ''];
  let text = componentLabelsForScreen(index, screenId).get(componentId) || component?.name || '';
  text = text.replace(/（第 \d+ 個）$/, '');
  if (kind && text.endsWith(` ${kind}`)) text = text.slice(0, -kind.length - 1);
  return text;
}

/** A response in a few words: a view's redirect or forward target, or the view it renders. */
export function responseSummary(
  status: string,
  bodyType: string,
  contentType: string,
): { type: string; outcome: string } {
  const view = bodyType.startsWith('VIEW: ') ? bodyType.slice(6) : '';
  const type = view ? contentType : bodyType || contentType;
  const outcomes = view
    ? view.split(' | ').map((part) => {
        const target = part.trim();
        if (target.startsWith('redirect:')) return `轉址到 ${target.slice(9)}`;
        if (target.startsWith('forward:')) return `轉送到 ${target.slice(8)}`;
        return `顯示畫面 ${target}`;
      })
    : [];
  return { type, outcome: [status, outcomes.join('／')].filter(Boolean).join(' ') };
}
