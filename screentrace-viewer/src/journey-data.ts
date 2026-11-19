import { Payload, Node as GraphNode } from './contracts';

/**
 * Values the person typed during one simulated journey, carried the way the real server carries
 * them (ADR 0187): a submitted form's fields reach the next page, pages that show an existing record
 * (a route with a path variable) show the same record, and fresh pages stay as captured. Field and
 * property names match when equal after ignoring case, `_` and `-` (`ownerName` ↔ `owner_name`).
 * Nothing here alters the graph, the review or browser storage.
 */
export type Snapshot = { name: string; index: number; value: string; checked?: boolean }[];

let record: Record<string, string> = Object.create(null);
let submitted = false;

const norm = (name: string) => name.toLowerCase().replace(/[_-]/g, '');
const typed = (field: Element) =>
  field.matches('input,select,textarea') &&
  !field.matches('[type=hidden],[type=password],[type=submit],[type=button],[type=file]');

/** A form was submitted: its named values travel with the request, as in the real system. */
export function rememberSubmission(form: HTMLFormElement) {
  for (const field of Array.from(form.elements)) {
    const name = field.getAttribute('name');
    if (!name || name.startsWith('_') || field.matches('[type=password],[disabled]')) continue;
    if (field.matches('[type=checkbox],[type=radio]')) {
      if ((field as HTMLInputElement).checked)
        record[norm(name)] = (field as HTMLInputElement).value;
      continue;
    }
    if (!typed(field) && !field.matches('[type=hidden]')) continue;
    const value = (field as HTMLInputElement).value;
    // A hidden field keeps what it carried before when the preview only has a sample in it.
    if (field.matches('[type=hidden]') && norm(name) in record) continue;
    record[norm(name)] = value.slice(0, 4000);
  }
  submitted = true;
}

/** Starts over, e.g. when the person leaves the simulation for the map. */
export function resetJourney() {
  record = Object.create(null);
  submitted = false;
}

/** What the person entered on a page, so going back shows it again. */
export function snapshotInputs(doc: Document): Snapshot {
  const seen = new Map<string, number>();
  const snapshot: Snapshot = [];
  for (const field of Array.from(doc.querySelectorAll('input[name],select[name],textarea[name]'))) {
    const name = field.getAttribute('name')!;
    const index = seen.get(name) ?? 0;
    seen.set(name, index + 1);
    if (field.matches('[type=hidden],[type=password],[type=submit],[type=button],[type=file]'))
      continue;
    const input = field as HTMLInputElement;
    snapshot.push(
      field.matches('[type=checkbox],[type=radio]')
        ? { name, index, value: input.value, checked: input.checked }
        : { name, index, value: input.value },
    );
  }
  return snapshot;
}

export function restoreInputs(doc: Document, snapshot: Snapshot) {
  const fields = new Map<string, Element[]>();
  for (const field of Array.from(doc.querySelectorAll('input[name],select[name],textarea[name]')))
    fields.set(field.getAttribute('name')!, [
      ...(fields.get(field.getAttribute('name')!) || []),
      field,
    ]);
  for (const item of snapshot) {
    const field = fields.get(item.name)?.[item.index] as HTMLInputElement | undefined;
    if (!field) continue;
    if (item.checked !== undefined) field.checked = item.checked;
    else field.value = item.value;
  }
}

/** Mirrors the capture's sample text for `${model.property}` so it can be replaced in place. */
function sample(value: string): string {
  if (/(^|[._])(premium|amount|total|price|fee)$/i.test(value)) return '1,000';
  if (/\.id$/.test(value)) return '1';
  if (/\.(firstName|givenName)$/.test(value)) return 'Alex';
  if (/\.lastName$/.test(value)) return 'Johnson';
  if (/\.(address|street)$/.test(value)) return '123 Sample Street';
  if (/\.(city|town)$/.test(value)) return 'Taipei';
  if (/\.(telephone|phone|mobile)$/.test(value)) return '02-5555-0101';
  if (/\.(birthDate|date)$/.test(value)) return '2020-05-12';
  if (/\.(description|message|note)$/.test(value)) return 'Routine check-up';
  if (/\.(name|title)$/.test(value)) return /owner/.test(value) ? 'Alex Johnson' : 'Buddy';
  return value.split(/[.[' ]/)[0].replace(/^./, (c) => c.toUpperCase()) || 'Sample value';
}

function replaceText(element: Element, from: string[], to: string): boolean {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode())
    for (const candidate of from)
      if (candidate && text.textContent?.includes(candidate)) {
        text.textContent = text.textContent.replace(candidate, to);
        return true;
      }
  return false;
}

const TERNARY =
  /^\$\{\s*([\w.]+)\s+(eq|ne|==|!=)\s+'([^']*)'\s*\?\s*'([^']*)'\s*:\s*'([^']*)'\s*\}$/;

/**
 * Shows the journey's values on a page reached by a simulated request. `route` is the page's
 * primary URL: one with a path variable shows a stored record, so it shows the journey's record.
 */
export function applyJourney(
  payload: Payload,
  screenId: string,
  doc: Document,
  route: string,
  revisit = false,
) {
  const arrivedBySubmit = submitted;
  submitted = false;
  // Going back shows a page as it was shown before, with the journey's values.
  if (!Object.keys(record).length || (!arrivedBySubmit && !revisit && !route.includes('{'))) return;
  const nodes = new Map(payload.graph.nodes.map((n) => [n.id, n]));
  const owned = new Set(
    (payload.graph.relationships || [])
      .filter((e) => e.type === 'CONTAINS' && e.from === screenId)
      .map((e) => e.to),
  );
  for (const element of Array.from(doc.querySelectorAll('[data-st-component-id]'))) {
    const node: GraphNode | undefined = nodes.get(element.getAttribute('data-st-component-id')!);
    if (!node || !owned.has(node.id) || node.attributes.repeated === 'true') continue;
    const a = node.attributes;
    if (a.kind === 'DISPLAY_FIELD' && a.property) {
      const value = record[norm(a.property.split('.').pop()!)];
      if (value === undefined && !/\}[^]*\$\{/.test(a.expression || '')) continue;
      const choice = TERNARY.exec(a.expression || '');
      if (choice && choice[1] === a.property) {
        if (value === undefined) continue;
        const shown =
          (value === choice[3]) === ['eq', '=='].includes(choice[2]) ? choice[4] : choice[5];
        replaceText(element, [choice[4], choice[5]], shown);
      } else if (
        /^(?:[^$]|\$(?!\{))*\$\{[\w.]+\}(?:(?:[^$]|\$(?!\{))*\$\{[\w.]+\})+/.test(
          a.expression || '',
        ) &&
        !element.children.length
      ) {
        // Several `${model.property}` parts in one text, e.g. 「起日 至 迄日」: replace in order.
        let text = element.textContent || '',
          cursor = 0;
        for (const [, part] of (a.expression || '').matchAll(/\$\{([\w.]+)\}/g)) {
          const at = text.indexOf(sample(part), cursor);
          if (at < 0) break;
          const known = record[norm(part.split('.').pop()!)];
          const shown = known ?? sample(part);
          text = text.slice(0, at) + shown + text.slice(at + sample(part).length);
          cursor = at + shown.length;
        }
        element.textContent = text;
      } else if (a.expression === '${' + a.property + '}') {
        if (value === undefined) continue;
        if (!replaceText(element, [sample(a.property)], value) && !element.children.length)
          element.textContent = value;
      }
      continue;
    }
    // Inputs the server fills from its model (Spring form tags) show the journey's values.
    const name = element.getAttribute('name');
    if (!name || !a.model || !typed(element)) continue;
    const value = record[norm(name)];
    if (value === undefined) continue;
    if (element.localName === 'select') {
      const select = element as HTMLSelectElement;
      if (Array.from(select.options).some((o) => o.value === value)) select.value = value;
    } else (element as HTMLInputElement).value = value;
  }
}
