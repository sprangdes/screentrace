import { parseExpression } from '@babel/parser';

/**
 * Which passing page state a piece of markup belongs to, read from the conditions it renders under
 * (ADR 0162): `loading`, `error` or `empty`, or null for the content shown when data is there. The
 * conditions are parsed, and only these shapes count:
 *
 * - a flag named like `loading` / `isLoading` / `fetching` → loading; its negation `!loaded`,
 *   `!ready`, `!initialized` → loading too;
 * - a flag whose name contains `error`, or is `failed` / `failure` → error;
 * - `x.length === 0`, `x.length < 1`, `!x.length`, a flag containing `empty` → empty;
 * - `status === 'loading' | 'error' | 'failed' | 'empty'` (either side) → that state.
 *
 * A negated loading or error flag (`!loading`) is the data state. The first state found wins in
 * the order loading, error, empty; anything else is not classified, so ordinary conditions (roles,
 * options) are never hidden.
 */
const cache = new Map();
const LOADING = /^(is)?(initial|page)?(loading|fetching)$|loading$/i;
const READY = /^(is)?(loaded|ready|initialized|initialised)$/i;
const ERROR = /error|^(load)?fail(ed|ure)?$/i;
const EMPTY = /empty/i;
const LITERAL_STATES = new Map([
  ['loading', 'loading'],
  ['error', 'error'],
  ['failed', 'error'],
  ['failure', 'error'],
  ['empty', 'empty'],
]);
const ORDER = ['loading', 'error', 'empty'];

const name = (node) => {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (
    (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') &&
    !node.computed &&
    node.property.type === 'Identifier'
  )
    return node.property.name;
  return null;
};
const isLength = (node) =>
  (node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression') &&
  !node.computed &&
  node.property?.name === 'length';
const numberIs = (node, value) => node?.type === 'NumericLiteral' && node.value === value;

function atom(node, negated) {
  if (!node) return null;
  if (node.type === 'UnaryExpression' && node.operator === '!')
    return atom(node.argument, !negated);
  if (node.type === 'LogicalExpression' && node.operator === '&&' && !negated) {
    const found = [atom(node.left, false), atom(node.right, false)].filter(Boolean);
    return ORDER.find((state) => found.includes(state)) ?? null;
  }
  if (node.type === 'BinaryExpression' && !negated) {
    const { left, right, operator } = node;
    if (['===', '=='].includes(operator)) {
      if ((isLength(left) && numberIs(right, 0)) || (isLength(right) && numberIs(left, 0)))
        return 'empty';
      const literal =
        left.type === 'StringLiteral' ? left : right.type === 'StringLiteral' ? right : null;
      if (literal) return LITERAL_STATES.get(literal.value.toLowerCase()) ?? null;
    }
    if (operator === '<' && isLength(left) && numberIs(right, 1)) return 'empty';
    return null;
  }
  const flag = name(node);
  if (flag === null) return null;
  if (negated) {
    if (READY.test(flag)) return 'loading';
    if (flag === 'length' && isLength(node)) return 'empty';
    return null;
  }
  if (LOADING.test(flag)) return 'loading';
  if (ERROR.test(flag)) return 'error';
  if (EMPTY.test(flag)) return 'empty';
  return null;
}

function classify(text) {
  if (cache.has(text)) return cache.get(text);
  let state;
  try {
    state = atom(parseExpression(text, { plugins: ['typescript', 'jsx'] }), false);
  } catch {
    state = null; // a condition that does not parse is not classified
  }
  cache.set(text, state);
  return state;
}

/** The page state a list of render conditions puts content in, or null. */
export function pageState(guards = []) {
  const found = guards.map(classify).filter(Boolean);
  return ORDER.find((state) => found.includes(state)) ?? null;
}
