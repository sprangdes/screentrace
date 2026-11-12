import { children, line, text, FUNCTIONS } from './modules.mjs';
import { unwrap, truthy } from './values.mjs';
import { atoms, implied } from './audience.mjs';
import { elementValue } from './routes.mjs';
import { boundText } from './text.mjs';

const MAX_GUARD = 300;
/**
 * What a click does is conditioned only by the handler itself; the conditions under which the element is
 * shown at all belong to the component (its `guard`), not to each of its behaviors.
 */
function unguarded(state) {
  return { ...state, guards: [] };
}
function guarded(state, guard) {
  return { ...state, guards: [...state.guards, guard] };
}
/** Every ConditionalExpression inside a URL expression (template literal parts and + operands). */
function conditionsIn(expr) {
  const node = unwrap(expr);
  if (!node) return [];
  if (node.type === 'ConditionalExpression')
    return [node, ...conditionsIn(node.consequent), ...conditionsIn(node.alternate)];
  if (node.type === 'TemplateLiteral') return node.expressions.flatMap(conditionsIn);
  if (node.type === 'BinaryExpression' && node.operator === '+')
    return [...conditionsIn(node.left), ...conditionsIn(node.right)];
  return [];
}
function alwaysReturns(node) {
  if (!node) return false;
  if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') return true;
  if (node.type === 'BlockStatement') return node.body.some(alwaysReturns);
  if (node.type === 'IfStatement')
    return alwaysReturns(node.consequent) && alwaysReturns(node.alternate);
  return false;
}
function joinGuards(guards) {
  if (!guards.length) return null;
  return guards.length === 1
    ? guards[0]
    : guards
        .map((item) => (/\|\||\?/.test(item) && !/^!\(.*\)$/.test(item) ? `(${item})` : item))
        .join(' && ');
}
function mergeGuards(left, right) {
  if (left === null || right === null) return null;
  if (left === right) return left;
  const merged = `(${left}) || (${right})`;
  return merged.length > MAX_GUARD ? merged.slice(0, MAX_GUARD - 1) + '…' : merged;
}
function dedupe(effects) {
  const result = new Map();
  for (const effect of effects) {
    const key = JSON.stringify([
      effect.type,
      effect.event,
      effect.urls,
      effect.method,
      effect.source,
      effect.guard,
    ]);
    if (!result.has(key)) result.set(key, effect);
  }
  return [...result.values()];
}
/** Only functions that actually forward their children contribute access constraints. */
function returnBranches(body, scope, evaluator) {
  const result = [];
  function expression(node, path) {
    if (node?.type === 'ConditionalExpression') {
      const known = truthy(evaluator.evaluate(node.test, scope)),
        condition = text(scope.module, node.test);
      if (known !== false)
        expression(
          node.consequent,
          known === true ? path : [...path, { expression: condition, node: node.test }],
        );
      if (known !== true)
        expression(
          node.alternate,
          known === false ? path : [...path, { expression: `!(${condition})`, node: node.test }],
        );
    } else result.push({ expr: node, path });
  }
  function statements(list, paths) {
    for (const node of list) {
      if (node.type === 'ReturnStatement') {
        paths.forEach((p) => expression(node.argument, p));
        return [];
      }
      if (node.type === 'BlockStatement') {
        paths = statements(node.body, paths);
        continue;
      }
      if (node.type === 'IfStatement') {
        const known = truthy(evaluator.evaluate(node.test, scope)),
          condition = text(scope.module, node.test);
        const left =
          known === false
            ? []
            : statements(
                node.consequent.type === 'BlockStatement'
                  ? node.consequent.body
                  : [node.consequent],
                paths.map((p) =>
                  known === true ? p : [...p, { expression: condition, node: node.test }],
                ),
              );
        const rest =
          known === true
            ? []
            : paths.map((p) =>
                known === false ? p : [...p, { expression: `!(${condition})`, node: node.test }],
              );
        paths = [
          ...left,
          ...(node.alternate
            ? statements(
                node.alternate.type === 'BlockStatement' ? node.alternate.body : [node.alternate],
                rest,
              )
            : rest),
        ];
      }
    }
    return paths;
  }
  if (body.type === 'BlockStatement') statements(body.body, [[]]);
  else expression(body, []);
  return result;
}
function wrapperFacts(body, scope, evaluator) {
  function carries(node) {
    if (!node) return false;
    if (
      ['Identifier', 'MemberExpression', 'OptionalMemberExpression'].includes(node.type) &&
      evaluator.evaluate(node, scope).t === 'children'
    )
      return true;
    return children(node).some(carries);
  }
  const savedPath = evaluator.routePath;
  evaluator.routePath = null;
  let raw;
  try {
    raw = returnBranches(body, scope, evaluator);
  } finally {
    evaluator.routePath = savedPath;
  }
  const accepted = raw.filter((b) => carries(b.expr)).map((b) => b.path);
  if (!accepted.length || accepted.some((p) => !p.length)) return [];
  if (accepted.length === 1)
    return accepted[0].flatMap((item) =>
      atoms(item.expression, { file: scope.module.file, line: line(item.node) }),
    );
  const expression = accepted
    .map((p) => '(' + p.map((i) => '(' + i.expression + ')').join(' && ') + ')')
    .join(' || ');
  return atoms(expression, { file: scope.module.file, line: line(body) })
    .map((atom) => ({
      ...atom,
      origins: accepted.flatMap((path) =>
        path.map((item) => ({ file: scope.module.file, line: line(item.node) })),
      ),
    }))
    .filter((a) => implied([], a.truth ? a.text : `!(${a.text})`) !== true);
}
function branchIdentity(input, scope, evaluator) {
  let node = unwrap(input);
  if (!node) return null;
  if (node.type === 'Identifier') {
    const value = evaluator.evaluate(node, scope);
    if (value.t === 'jsx') return branchIdentity(value.node, value.scope, evaluator);
  }
  if (node.type === 'JSXFragment') {
    const items = node.children.filter((c) => c.type === 'JSXElement');
    return items.length === 1 ? branchIdentity(items[0], scope, evaluator) : null;
  }
  if (node.type !== 'JSXElement') return null;
  const value = elementValue(evaluator, node, scope);
  if (value.t !== 'fn') return null;
  const nested = node.children
    .filter((c) => c.type === 'JSXElement')
    .map((c) => branchIdentity(c, scope, evaluator))
    .filter(Boolean);
  return value.scope.module.file + ':' + value.node.start + ':' + nested.join(',');
}
/** A pure single-return discriminator is the same branch predicate as its literal result. */
function expandScalarCondition(input, scope, evaluator) {
  const node = unwrap(input);
  if (
    node?.type !== 'BinaryExpression' ||
    !['===', '!=='].includes(node.operator) ||
    unwrap(node.left)?.type !== 'CallExpression'
  )
    return null;
  const call = unwrap(node.left),
    fn = evaluator.evaluate(call.callee, scope),
    expected = evaluator.evaluate(node.right, scope);
  if (fn.t !== 'fn' || expected.t !== 'lit') return null;
  function pure(n, current) {
    n = unwrap(n);
    if (!n) return false;
    if (n.type === 'CallExpression')
      return (
        n.callee.type === 'Identifier' &&
        n.callee.name === 'Boolean' &&
        !evaluator.lookup('Boolean', current) &&
        n.arguments.length === 1 &&
        pure(n.arguments[0], current)
      );
    if (
      [
        'AssignmentExpression',
        'UpdateExpression',
        'AwaitExpression',
        'NewExpression',
        'YieldExpression',
      ].includes(n.type) ||
      FUNCTIONS.has(n.type)
    )
      return false;
    return children(n).every((c) => pure(c, current));
  }
  const body = fn.node.body.type === 'BlockStatement' ? fn.node.body.body : [];
  if (
    body.length !== 1 ||
    body[0].type !== 'ReturnStatement' ||
    !pure(body[0].argument, fn.scope) ||
    !call.arguments.every((a) => pure(a, scope))
  )
    return null;
  const inner = evaluator.functionScope(
      fn.node,
      fn.scope,
      call.arguments.map((expr) => ({ expr, scope })),
    ),
    branches = returnBranches(fn.node.body, inner, evaluator),
    paths = [];
  for (const branch of branches) {
    const value = evaluator.evaluate(branch.expr, inner);
    if (value.t !== 'lit') return null;
    if ((value.v === expected.v) !== (node.operator === '===')) continue;
    const path = branch.path.map((item) => {
      const value = boundText(item.node, inner, evaluator);
      return item.expression === text(inner.module, item.node) ? value : `!(${value})`;
    });
    if (!path.length) return 'true';
    paths.push('(' + path.join(' && ') + ')');
  }
  return paths.length ? paths.join(' || ') : 'false';
}
function hasEarlyExit(node) {
  if (!node || FUNCTIONS.has(node.type)) return false;
  return (
    ['BreakStatement', 'ContinueStatement', 'ReturnStatement', 'ThrowStatement'].includes(
      node.type,
    ) || children(node).some(hasEarlyExit)
  );
}

export {
  unguarded,
  guarded,
  conditionsIn,
  alwaysReturns,
  joinGuards,
  mergeGuards,
  dedupe,
  returnBranches,
  wrapperFacts,
  branchIdentity,
  expandScalarCondition,
  hasEarlyExit,
};
