import { line, text } from './modules.mjs';
import { unwrap, truthy } from './values.mjs';
import { returnBranches } from './branches.mjs';
import { attribute, attributeExpression } from './jsx.mjs';
import { boundText } from './text.mjs';

const LOCATION_OWNERS = new Set(['window', 'globalThis', 'document', 'self']);
/** `location`, `window.location` and friends; with `href`, also the `.href` property of either. */
function isLocation(node, evaluator, scope, allowHref) {
  let target = unwrap(node);
  if (
    allowHref &&
    target?.type === 'MemberExpression' &&
    !target.computed &&
    target.property.name === 'href'
  )
    target = unwrap(target.object);
  if (target?.type === 'Identifier')
    return target.name === 'location' && !evaluator.lookup('location', scope);
  if (target?.type !== 'MemberExpression' || target.computed || target.property.name !== 'location')
    return false;
  const owner = unwrap(target.object);
  return (
    owner.type === 'Identifier' &&
    LOCATION_OWNERS.has(owner.name) &&
    !evaluator.lookup(owner.name, scope)
  );
}
/** Keeps only URLs a request or navigation could use: absolute paths or http(s) URLs, without query or fragment. */
function isRelativeUrl(candidate) {
  const value = candidate.split(/[?#]/)[0];
  return (
    value !== '' &&
    !value.startsWith('/') &&
    !value.startsWith('{') &&
    !/^[a-z][a-z0-9+.-]*:/i.test(value)
  );
}
/** Resolves a relative request URL the way the browser does from the route's page; null for a non-literal route. */
function resolveAgainstRoute(candidate, route) {
  if (typeof route !== 'string' || !route.startsWith('/') || route.includes('*')) return null;
  try {
    const resolved = new URL(candidate, 'http://screentrace.invalid' + route);
    return resolved.origin === 'http://screentrace.invalid'
      ? decodeURI(resolved.pathname) + resolved.search
      : null;
  } catch {
    return null;
  }
}
/** The evaluated href with its query (attrs.href of a non-literal href is already query-free), used only for query-entry selection. */
function hrefEntryUrls(evaluator, node, scope, fallback) {
  const expr = attributeExpression(attribute(node, 'href'));
  return expr ? evaluator.strings(expr, scope) : [fallback];
}
function cleanUrls(candidates) {
  const urls = new Set();
  for (const candidate of candidates) {
    const value = candidate.split(/[?#]/)[0];
    if (/^https?:\/\//i.test(value)) urls.add(value);
    else if (value.startsWith('/'))
      urls.add(value.length > 1 ? value.replace(/\/+$/, '') || '/' : value);
  }
  return [...urls].sort();
}
function destinationCandidates(input, scope, evaluator, maxDepth) {
  let handled = false,
    visits = 0,
    unprovenArguments = false;
  function stableArgument(input) {
    const n = unwrap(input);
    if (!n) return false;
    if (
      ['Identifier', 'StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral'].includes(
        n.type,
      )
    )
      return true;
    return (
      ['MemberExpression', 'OptionalMemberExpression'].includes(n.type) &&
      stableArgument(n.object) &&
      (!n.computed || ['StringLiteral', 'NumericLiteral'].includes(n.property.type))
    );
  }
  function resolve(expr, current, conditions = [], trace = [], depth = 0, active = new Set()) {
    const node = unwrap(expr),
      source = { file: current.module.file, line: line(node) };
    const unknown = () => [{ urls: [], conditions, trace, source, status: 'UNRESOLVED' }];
    if (!node || depth >= maxDepth || ++visits > 4096) return unknown();
    if (node.type === 'MemberExpression' && !node.computed && node.property.name === 'path')
      return resolve(node.object, current, conditions, trace, depth + 1, active);
    if (node.type === 'Identifier') {
      const found = evaluator.lookup(node.name, current);
      if (found?.binding?.expr)
        return resolve(
          found.binding.expr,
          found.binding.scope,
          conditions,
          trace,
          depth + 1,
          active,
        );
      if (
        found?.entry?.kind === 'variable' &&
        found.entry.node.init &&
        !(found.entry.steps ?? []).length
      )
        return resolve(found.entry.node.init, found.scope, conditions, trace, depth + 1, active);
    }
    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
      const fn = evaluator.evaluate(node.callee, current);
      if (fn.t !== 'fn') return unknown();
      handled = true;
      if (active.has(fn.node)) return unknown();
      if (node.arguments.some((arg) => !stableArgument(arg))) unprovenArguments = true;
      const inner = evaluator.functionScope(
          fn.node,
          fn.scope,
          node.arguments.map((expr) => ({ expr, scope: current })),
          depth + 1,
        ),
        next = new Set([...active, fn.node]);
      const branches = returnBranches(fn.node.body, inner, evaluator);
      return branches.flatMap((branch) => {
        const path = branch.path.map((item) => {
          const value = boundText(item.node, inner, evaluator);
          return item.expression === text(inner.module, item.node) ? value : `!(${value})`;
        });
        const step = {
          callee: text(current.module, node.callee),
          source: { file: inner.module.file, line: line(branch.expr) },
        };
        return resolve(
          branch.expr,
          inner,
          [...conditions, ...path],
          [...trace, step],
          depth + 1,
          next,
        );
      });
    }
    if (node.type === 'ConditionalExpression') {
      handled = true;
      const condition = boundText(node.test, current, evaluator),
        known = truthy(evaluator.evaluate(node.test, current));
      return [
        ...(known !== false
          ? resolve(
              node.consequent,
              current,
              known === true ? conditions : [...conditions, condition],
              trace,
              depth + 1,
              active,
            )
          : []),
        ...(known !== true
          ? resolve(
              node.alternate,
              current,
              known === false ? conditions : [...conditions, `!(${condition})`],
              trace,
              depth + 1,
              active,
            )
          : []),
      ];
    }
    if (node.type === 'ObjectExpression') {
      const path = node.properties.find(
        (p) => p.type === 'ObjectProperty' && !p.computed && (p.key.name ?? p.key.value) === 'path',
      );
      return path ? resolve(path.value, current, conditions, trace, depth + 1, active) : unknown();
    }
    const value = evaluator.evaluate(node, current);
    return value.t === 'lit' && typeof value.v === 'string'
      ? [{ urls: [value.v], conditions, trace, source, status: 'INFERRED' }]
      : unknown();
  }
  const items = resolve(input, scope);
  return { handled, items, conditionsProvable: !unprovenArguments, limited: visits > 4096 };
}

export {
  isLocation,
  isRelativeUrl,
  resolveAgainstRoute,
  hrefEntryUrls,
  cleanUrls,
  destinationCandidates,
};
