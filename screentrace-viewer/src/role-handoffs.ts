import { Index } from './map';
import { PersonaView } from './personas';
import { rootTrigger } from './usage';
import { componentLabelsForScreen } from './labels';

/**
 * Where one role's flow meets another's, only as far as the graph proves it (no business meaning is inferred):
 * `link` — a screen only role A reaches has a link, button or form that leads straight to a screen only role B
 * reaches; `state` — a screen only A reaches and one only B reaches are states of the same JSP page.
 */
export interface Handoff {
  kind: 'link' | 'state';
  from: { screen: string; role: string };
  to: { screen: string; role: string };
  /** For `link`: the labels of the controls that lead there (may be empty when they have no text). */
  labels: string[];
}

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The base screen of a JSP page's states: the screen itself for the first state or a page without states. */
export const stateBase = (index: Index, id: string) =>
  index.nodes.get(id)?.attributes.stateVariantOf || id;

/** How many states each page has, by screen: screens sharing one base are the states of one page. */
function stateFamilies(index: Index): Map<string, string[]> {
  // The same members as the review stage's state switch: screens with a state, by their base.
  const families = new Map<string, string[]>();
  for (const screen of index.screens) {
    if (!screen.attributes.stateVariant) continue;
    const base = stateBase(index, screen.id);
    families.set(base, [...(families.get(base) || []), screen.id]);
  }
  return families;
}
export function stateCounts(index: Index): Map<string, number> {
  const result = new Map<string, number>();
  for (const members of stateFamilies(index).values())
    for (const id of members) result.set(id, members.length);
  return result;
}

export function handoffs(index: Index, views: PersonaView[]): Handoff[] {
  const result: Handoff[] = [];
  const only = (id: string, view: PersonaView, other: PersonaView) =>
    view.depth.has(id) && !other.depth.has(id);
  const seen = new Set<string>();
  for (const a of views)
    for (const b of views) {
      if (a === b) continue;
      const aId = a.persona.id,
        bId = b.persona.id;
      for (const relation of index.relations) {
        if (relation.from === relation.to) continue;
        if (!only(relation.from, a, b) || !only(relation.to, b, a)) continue;
        const key = JSON.stringify(['link', relation.from, relation.to, aId, bId]);
        if (seen.has(key)) continue;
        seen.add(key);
        const labels = componentLabelsForScreen(index, relation.from);
        result.push({
          kind: 'link',
          from: { screen: relation.from, role: aId },
          to: { screen: relation.to, role: bId },
          labels: [
            ...new Set(relation.triggers.map((t) => labels.get(t) || '').filter(Boolean)),
          ].sort(),
        });
      }
    }
  // States of one page split between two roles: one item per page and pair of roles.
  for (const [base, members] of stateFamilies(index)) {
    if (members.length < 2) continue;
    members.sort(order);
    views.forEach((a, i) =>
      views.slice(i + 1).forEach((b) => {
        const x = members.find((id) => only(id, a, b)),
          y = members.find((id) => only(id, b, a));
        if (!x || !y) return;
        const key = JSON.stringify(['state', base, a.persona.id, b.persona.id]);
        if (seen.has(key)) return;
        seen.add(key);
        result.push({
          kind: 'state',
          from: { screen: x, role: a.persona.id },
          to: { screen: y, role: b.persona.id },
          labels: [],
        });
      }),
    );
  }
  return result;
}

/** Screens with a link, button or form whose destination the analysis could not determine, with those controls. */
export function unresolvedSources(index: Index): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const b of index.graph.behaviors || []) {
    if (!['NAVIGATE', 'SUBMIT_FORM'].includes(b.type) || b.targetId) continue;
    const trigger = rootTrigger(index, b);
    if (!trigger) continue;
    const onScreen = index.nodes.get(trigger)?.type === 'SCREEN',
      sources = onScreen ? [trigger] : index.owners.get(trigger) || [];
    for (const id of sources) {
      const list = result.get(id) || [];
      if (!onScreen && !list.includes(trigger)) list.push(trigger);
      result.set(id, list);
    }
  }
  return result;
}
