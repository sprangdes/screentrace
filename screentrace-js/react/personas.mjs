import { parseExpression } from '@babel/parser';
import { atoms, unique, contradicts, leaves, implied } from './audience.mjs';
import { pageState } from './page-states.mjs';

const literal = (n) =>
  ['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral'].includes(n.type);
function parts(leaf) {
  try {
    const n = parseExpression(leaf, { plugins: ['typescript'] });
    if (n.type === 'BinaryExpression' && n.operator === '===' && literal(n.right))
      return [leaf.slice(n.left.start, n.left.end), leaf.slice(n.right.start, n.right.end)];
    return [leaf, null];
  } catch {
    return null;
  }
}
export function personaDimensions(screens, routeRedirects) {
  const sources = [];
  const add = (expression, source) => {
    if (expression) sources.push({ expression, source });
  };
  for (const screen of screens) {
    for (const atom of screen.audience ?? []) add(atom.raw ?? atom.text, atom.source);
    for (const e of screen.load) if (e.type === 'NAVIGATE') add(e.guard, e.source);
    for (const c of screen.components) {
      add(c.guard, { file: c.file, line: c.line });
      for (const e of c.behaviors) if (e.type === 'NAVIGATE') add(e.guard, e.source);
    }
  }
  for (const r of routeRedirects) add(r.effect.guard, r.effect.source);
  const map = new Map();
  for (const { expression, source } of sources)
    for (const leaf of leaves(expression)) {
      const part = parts(leaf);
      if (!part) continue;
      const [text, value] = part;
      let d = map.get(text);
      if (!d) {
        d = { text, values: new Set(), truthy: false, source };
        map.set(text, d);
      }
      if (value === null) d.truthy = true;
      else d.values.add(value);
      if (
        source &&
        (source.file < d.source.file ||
          (source.file === d.source.file && source.line < d.source.line))
      )
        d.source = source;
    }
  const uses = new Map();
  for (const screen of screens) {
    const seen = new Set();
    for (const atom of screen.audience ?? [])
      for (const leaf of leaves(atom.raw ?? atom.text)) {
        const part = parts(leaf);
        if (part) seen.add(part[0]);
      }
    for (const text of seen) uses.set(text, (uses.get(text) ?? 0) + 1);
  }
  const all = [...map.values()]
    .map((d) => ({ ...d, values: [...d.values].sort(), uses: uses.get(d.text) ?? 0 }))
    .sort((a, b) => b.uses - a.uses || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
    .map(({ uses, ...d }) => d);
  const dimensions = all
      .slice(0, 64)
      .sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0)),
    diagnostics =
      all.length > 64
        ? [
            {
              code: 'PERSONA_DIMENSIONS_TRUNCATED',
              message: '身分維度超過 64 個，只列出前 64 個',
              source: dimensions[0].source,
            },
          ]
        : [];
  return { dimensions, all, diagnostics };
}
/**
 * Personas suggested from the route guards when the analyst configured none (ADR 0167): of the
 * conditions compared with two or more string values, the one most screens are guarded by (then
 * the one with most values) is the role; its object, when it
 * is itself a condition (`me` for `me.role`), tells signed-in from signed-out; loading flags are
 * false for every persona, and exception flags of the signed-in object named `must…`, `force…`,
 * `needs…` or `requires…` are false for the role personas; any other flag of that object takes
 * the value most screens guarded by the role require. Each persona says it is a suggestion and which condition defines it.
 */
export function suggestPersonas(dimensions, screens) {
  const uses = new Map();
  for (const screen of screens) {
    const seen = new Set();
    for (const atom of screen.audience ?? [])
      for (const leaf of leaves(atom.raw ?? atom.text)) {
        const part = parts(leaf);
        if (part) seen.add(part[0]);
      }
    for (const text of seen) uses.set(text, (uses.get(text) ?? 0) + 1);
  }
  const words = (d) => d.values.filter((v) => /^(["']).*\1$/.test(v));
  const role = dimensions
    .filter((d) => words(d).length >= 2)
    .sort(
      (a, b) =>
        (uses.get(b.text) ?? 0) - (uses.get(a.text) ?? 0) ||
        words(b).length - words(a).length ||
        (a.text < b.text ? -1 : 1),
    )[0];
  if (!role) return [];
  const base = role.text.replace(/\?\./g, '.').split('.')[0];
  const login = dimensions.find((d) => d.truthy && d.text === base);
  const fact = (text, truth, source) => atoms(truth ? text : `!(${text})`, source);
  const common = dimensions
    .filter((d) => d.truthy && pageState([d.text]) === 'loading')
    .flatMap((d) => fact(d.text, false, d.source));
  // Exception flags on the signed-in object (`me.mustChangePassword`) are off for an ordinary user.
  const exceptions = dimensions
    .filter(
      (d) =>
        d.truthy &&
        d.text.replace(/\?\./g, '.').startsWith(`${base}.`) &&
        /^(must|force|needs?|requires?)[A-Z]/.test(d.text.split(/\??\./).at(-1)),
    )
    .flatMap((d) => fact(d.text, false, d.source));
  const list = [];
  if (login)
    list.push({
      id: 'guest',
      name: '未登入',
      description: `自動建議：依路由條件，${base} 不存在`,
      facts: unique([...fact(login.text, false, login.source), ...common]),
    });
  const ids = new Set(list.map((p) => p.id));
  const flag = (text) =>
    text.startsWith(`${base}.`) && /^[\w$.]+$/.test(text) && text !== role.text;
  const isException = (text) => /^(must|force|needs?|requires?)[A-Z]/.test(text.split('.').at(-1));
  /**
   * Other flags of the signed-in object that screens guarded by this role require (`me.business`):
   * the value most of those screens require, when it is a strict majority, is the role's ordinary
   * state.
   */
  const ordinary = (value) => {
    const roleFact = `${role.text} === ${value.replace(/^'(.*)'$/, '"$1"')}`,
      tally = new Map();
    for (const screen of screens) {
      const atomsOf = screen.audience ?? [];
      if (!atomsOf.some((a) => a.text === roleFact && a.truth)) continue;
      for (const a of atomsOf)
        if (flag(a.text) && !isException(a.text)) {
          const count = tally.get(a.text) ?? { yes: 0, no: 0 };
          count[a.truth ? 'yes' : 'no']++;
          tally.set(a.text, count);
        }
    }
    const facts = [];
    for (const [text, { yes, no }] of [...tally].sort(([a], [b]) => (a < b ? -1 : 1)))
      if (yes !== no) {
        const dimension = dimensions.find((d) => d.text === text);
        facts.push(...fact(text, yes > no, dimension?.source ?? role.source));
      }
    return facts;
  };
  for (const value of words(role)) {
    const word = value.slice(1, -1);
    let id = `role-${
      word
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'x'
    }`;
    for (let n = 2; ids.has(id); n++) id = `${id.slice(0, 28)}-${n}`;
    ids.add(id);
    list.push({
      id,
      name: (word.replace(/^ROLE_/i, '') || word).slice(0, 40),
      description: `自動建議：依路由條件 ${role.text} === ${value}`.slice(0, 80),
      facts: unique([
        ...(login ? fact(login.text, true, login.source) : []),
        ...fact(`${role.text} === ${value}`, true, role.source),
        ...ordinary(value),
        ...exceptions,
        ...common,
      ]),
    });
  }
  return list
    .filter((p) => !contradicts(p.facts))
    .slice(0, 8)
    .map((p) => ({ ...p, startPaths: ['/'], suggested: true }));
}

export function normalizePersonas(personas, dimensions) {
  const result = [],
    diagnostics = [];
  for (const persona of personas) {
    const source = { file: 'workspace:config.json', line: persona.line };
    const facts = unique(
      persona.facts.flatMap((f) => atoms(f.truth ? f.text : '!(' + f.text + ')', source)),
    );
    if (contradicts(facts)) {
      diagnostics.push({
        code: 'PERSONA_CONTRADICTORY',
        message: `角色 ${persona.id} 的條件互相矛盾，已略過`,
        source,
      });
      continue;
    }
    for (const fact of facts)
      for (const leaf of leaves(fact.text)) {
        const part = parts(leaf);
        if (
          !dimensions.some(
            (d) => d.text === leaf || (part && d.text === part[0] && d.values.includes(part[1])),
          )
        )
          diagnostics.push({
            code: 'PERSONA_FACT_UNMATCHED',
            message: `角色 ${persona.id} 的條件 ${leaf} 未出現在任何畫面或導覽條件中`,
            source,
          });
      }
    result.push({ id: persona.id, name: persona.name, startPaths: persona.startPaths, facts });
  }
  return { personas: result, diagnostics };
}

const expressionOf = (a) => (a.truth ? (a.raw ?? a.text) : `!(${a.raw ?? a.text})`);
/** APPLIES when every condition is proven, EXCLUDED when one contradicts the persona, otherwise UNKNOWN. */
export function verdict(facts, audience, conditions) {
  if (contradicts([...facts, ...audience])) return 'EXCLUDED';
  let unknown = audience.some((a) => implied(facts, expressionOf(a)) !== true);
  for (const condition of conditions) {
    if (!condition) continue;
    const value = implied([...facts, ...audience], condition);
    if (value === false) return 'EXCLUDED';
    if (value === null) unknown = true;
  }
  return unknown ? 'UNKNOWN' : 'APPLIES';
}

/** The screen's conditions a persona has to meet: a route split by a URL parameter leaves the parameter to the link, so the plain version drops its "parameter absent" conditions. */
function personaAudience(screen) {
  const defaults = screen.queryDefaults ?? [];
  return (screen.audience ?? []).filter(
    (a) => !defaults.some((d) => d.text === a.text && d.truth === a.truth),
  );
}
/** A navigation whose URL does not choose between a route's plain and parameter versions cannot make either one certain. */
function undecided(effect, screens) {
  const targets = effect.targetScreens
    ? screens.filter((s) =>
        effect.targetScreens.some(
          (t) =>
            t.file === s.file &&
            t.route === s.route &&
            t.variantKey === s.variantKey &&
            t.entryQuery === s.entryQuery &&
            t.stateKey === s.stateKey,
        ),
      )
    : screens.filter((s) => !s.stateKey && (effect.targetRoutes ?? []).includes(s.route));
  return targets.some(
    (plain) =>
      plain.queryEntryPlain &&
      targets.some((other) => other.route === plain.route && other.entryQuery),
  );
}
const cap = (value, effect, screens) =>
  value === 'APPLIES' && undecided(effect, screens) ? 'UNKNOWN' : value;

export function applyPersonas(personas, screens, routeRedirects) {
  for (const persona of personas) {
    for (const screen of screens) {
      (screen.personas ??= {})[persona.id] = verdict(persona.facts, personaAudience(screen), []);
      for (const effect of screen.load)
        if (effect.type === 'NAVIGATE')
          (effect.personas ??= {})[persona.id] = cap(
            effect.shellRouteFacts
              ? verdict(persona.facts, effect.shellRouteFacts, [])
              : verdict(persona.facts, [], [effect.guard]),
            effect,
            screens,
          );
      for (const component of screen.components)
        for (const effect of component.behaviors)
          if (effect.type === 'NAVIGATE')
            (effect.personas ??= {})[persona.id] = cap(
              verdict(persona.facts, [], [component.guard, effect.guard]),
              effect,
              screens,
            );
    }
    for (const redirect of routeRedirects)
      if (redirect.effect.type === 'NAVIGATE')
        (redirect.effect.personas ??= {})[persona.id] = cap(
          redirect.effect.shellRouteFacts
            ? verdict(persona.facts, redirect.effect.shellRouteFacts, [])
            : verdict(persona.facts, [], [redirect.effect.guard]),
          redirect.effect,
          screens,
        );
  }
}
