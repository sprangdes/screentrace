import { Graph } from '../contracts';
import { callSources } from '../usage';
import { stateChanges } from './states';

interface PersonaLike {
  id?: string;
  name?: string;
  description?: string;
  facts?: { text?: string; truth?: boolean }[];
}

/** The heading of a screen that creates an account: `建立商家帳號` names the role 商家. */
const CREATES = /^\s*(?:建立|註冊|申請|新增|開設)\s*(.+?)\s*(?:帳號|帳戶|會員帳號|會員)\s*$/;
const ROLE_FACT = /^[\w$.?]+ === "([^"]+)"$/;

/**
 * Plain names for the personas the analysis suggested on its own (ADR 0178). A suggested persona
 * is named after its role value (`BUSINESS`) unless the frontend has a word for it; when the backend
 * creates an object with exactly that value (a proven write marked as a new object) and every screen
 * calling those APIs is headed like `建立商家帳號`, the role is called by what that heading says.
 * Several different words, none, or a name another persona already has leave the name unchanged.
 * Personas the analyst configured are never renamed.
 */
export function suggestedPersonaNames(
  graph: Graph,
  headingOf: (screenId: string) => string | undefined,
): Map<string, { name: string; heading: string }> {
  const personas = (graph.application.personas || []) as PersonaLike[];
  const suggested = personas.filter(
    (p) => typeof p.id === 'string' && p.description?.startsWith('自動建議：依路由條件 '),
  );
  const result = new Map<string, { name: string; heading: string }>();
  if (!suggested.length) return result;
  const endpointsOf = new Map<string, string[]>();
  for (const edge of graph.relationships || [])
    if (edge.type === 'HANDLED_BY')
      endpointsOf.set(edge.to, [...(endpointsOf.get(edge.to) || []), edge.from]);
  const callers = callSources(graph);
  const taken = new Set(personas.map((p) => p.name));
  for (const persona of suggested) {
    const values = (persona.facts || [])
      .filter((f) => f.truth === true && typeof f.text === 'string')
      .map((f) => ROLE_FACT.exec(f.text!)?.[1])
      .filter((v): v is string => !!v);
    if (values.length !== 1) continue;
    const headings = new Set<string>(),
      names = new Set<string>();
    let unnamed = false;
    for (const handler of graph.nodes)
      if (
        handler.type === 'HANDLER' &&
        stateChanges(handler).some((c) => c.value === values[0] && c.fromCreated === true)
      )
        for (const endpoint of endpointsOf.get(handler.id) || [])
          for (const caller of callers.get(endpoint) || []) {
            const heading = headingOf(caller.screenId)?.trim();
            const name = heading ? CREATES.exec(heading)?.[1] : undefined;
            if (!heading || !name) unnamed = true;
            else {
              headings.add(heading);
              names.add(name);
            }
          }
    if (unnamed || names.size !== 1) continue;
    const name = [...names][0];
    if (taken.has(name)) continue;
    taken.add(name);
    result.set(persona.id!, { name, heading: [...headings].sort()[0] });
  }
  return result;
}

/** The graph with those names applied and their origin added to the description. */
export function withSuggestedPersonaNames(
  graph: Graph,
  names: Map<string, { name: string; heading: string }>,
): Graph {
  if (!names.size) return graph;
  const personas = (graph.application.personas || []) as PersonaLike[];
  return {
    ...graph,
    application: {
      ...graph.application,
      personas: personas.map((p) => {
        const found = p.id ? names.get(p.id) : undefined;
        return found
          ? {
              ...p,
              name: found.name,
              description: `${p.description}；名稱取自建立此角色帳號的畫面「${found.heading}」`,
            }
          : p;
      }),
    },
  };
}
