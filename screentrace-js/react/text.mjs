import { text } from './modules.mjs';
import { unwrap } from './values.mjs';

const MAX_LABEL = 80;
function hasContent(node) {
  return node.children.some((child) => (typeof child === 'string' ? child.trim() : true));
}
function textual(node) {
  const n = unwrap(node);
  return ['StringLiteral', 'TemplateLiteral', 'NumericLiteral', 'BinaryExpression'].includes(
    n?.type,
  );
}
function intrinsicKind(tag, attrs, insideForm, interactive) {
  const type = (attrs.type ?? '').toLowerCase();
  switch (tag) {
    case 'a':
      return attrs.href || interactive ? 'LINK' : null;
    case 'button':
      return type === 'submit' || (!type && insideForm) ? 'SUBMIT' : 'BUTTON';
    case 'input':
      if (type === 'hidden') return null;
      if (type === 'submit' || type === 'image') return 'SUBMIT';
      if (type === 'button' || type === 'reset') return 'BUTTON';
      if (type === 'checkbox') return 'CHECKBOX';
      if (type === 'radio') return 'RADIO';
      if (['date', 'datetime-local', 'time', 'month', 'week'].includes(type)) return 'DATE_PICKER';
      if (type === 'file') return 'FILE_INPUT';
      return 'TEXT_INPUT';
    case 'select':
      return attrs.multiple ? 'MULTI_SELECT' : 'SELECT';
    case 'textarea':
      return 'TEXTAREA';
    case 'form':
      return 'FORM';
    case 'dialog':
      return 'MODAL';
    case 'table':
      return 'TABLE';
    default:
      if (
        attrs.role === 'dialog' ||
        attrs.role === 'alertdialog' ||
        /(^|\s)modal(\s|$)/.test(attrs.className ?? '')
      )
        return 'MODAL';
      if (attrs.role === 'button') return 'BUTTON';
      return interactive ? 'OTHER' : null;
  }
}
function labelOf(node, attrs, evaluator, scope, kind) {
  if (kind === 'FORM' || kind === 'TABLE') {
    for (const name of ['aria-label', 'title', 'name', 'id'])
      if (attrs[name]) return { text: attrs[name].slice(0, MAX_LABEL), source: name };
    return { text: null, source: null };
  }
  const visible = visibleText(node.children, evaluator, scope, 0).replace(/\s+/g, ' ').trim();
  if (visible) return { text: visible.slice(0, MAX_LABEL), source: 'visibleText' };
  for (const name of ['aria-label', 'title', 'placeholder', 'value', 'alt', 'name', 'id'])
    if (attrs[name]) return { text: attrs[name].slice(0, MAX_LABEL), source: name };
  return { text: null, source: null };
}
function visibleText(nodes, evaluator, scope, depth) {
  if (depth > 4) return '';
  let out = '';
  for (const child of nodes ?? []) {
    if (child.type === 'JSXText') out += ' ' + child.value;
    else if (child.type === 'JSXExpressionContainer')
      out += ' ' + expressionText(child.expression, evaluator, scope, depth).join(' / ');
    else if (child.type === 'JSXElement' || child.type === 'JSXFragment')
      out += ' ' + visibleText(child.children, evaluator, scope, depth + 1);
  }
  return out;
}
/** Text alternatives an expression child can show; parts that cannot be proven contribute nothing. */
function expressionText(expr, evaluator, scope, depth) {
  const node = unwrap(expr);
  if (!node || depth > 4) return [];
  if (node.type === 'ConditionalExpression')
    return distinctText([
      ...expressionText(node.consequent, evaluator, scope, depth + 1),
      ...expressionText(node.alternate, evaluator, scope, depth + 1),
    ]);
  if (node.type === 'LogicalExpression')
    return expressionText(node.right, evaluator, scope, depth + 1);
  if (node.type === 'JSXElement' || node.type === 'JSXFragment')
    return distinctText([
      visibleText(
        node.type === 'JSXElement' ? node.children : node.children,
        evaluator,
        scope,
        depth + 1,
      ),
    ]);
  const value = evaluator.evaluate(node, scope);
  if (value.t === 'lit' && (typeof value.v === 'string' || typeof value.v === 'number'))
    return [String(value.v)];
  if (value.t === 'children')
    return distinctText([
      visibleText(value.closure.nodes, evaluator, value.closure.scope, depth + 1),
    ]);
  if (value.t === 'jsx') return expressionText(value.node, evaluator, value.scope, depth + 1);
  const options = literalAlternatives(evaluator, node, scope);
  return options ? [options] : [];
}
function distinctText(items) {
  return [...new Set(items.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean))];
}
const LABEL_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'value', 'alt']);
/** `{busy ? '登入中…' : '登入'}` reads as `登入中… / 登入`; anything with an unproven part is left out. */
function literalAlternatives(evaluator, expr, scope) {
  const node = unwrap(expr);
  if (
    !node ||
    ![
      'ConditionalExpression',
      'LogicalExpression',
      'TemplateLiteral',
      'Identifier',
      'MemberExpression',
    ].includes(node.type)
  )
    return null;
  const options = evaluator.strings(node, scope).filter((item) => item.trim());
  return options.length && options.every((item) => !item.includes('{'))
    ? options.join(' / ')
    : null;
}
/** Substitute parameter bindings through AST source ranges; local state remains symbolic. */
function boundText(node, scope, evaluator, seen = new Set(), constants = false) {
  const source = text(scope.module, node),
    edits = [];
  function visit(n, parent, key) {
    if (
      n.type === 'Identifier' &&
      !(
        parent &&
        ((['MemberExpression', 'OptionalMemberExpression'].includes(parent.type) &&
          key === 'property' &&
          !parent.computed) ||
          (parent.type === 'ObjectProperty' && key === 'key' && !parent.computed))
      )
    ) {
      const found = evaluator.lookup(n.name, scope),
        binding = found?.binding;
      if (binding?.expr && !seen.has(binding)) {
        const next = new Set([...seen, binding]);
        const expr = unwrap(binding.expr);
        const value =
          expr.type === 'CallExpression' &&
          expr.callee.type === 'Identifier' &&
          expr.callee.name === 'Boolean' &&
          !evaluator.lookup('Boolean', binding.scope) &&
          expr.arguments.length === 1
            ? '!!(' + boundText(expr.arguments[0], binding.scope, evaluator, next, constants) + ')'
            : boundText(expr, binding.scope, evaluator, next, constants);
        edits.push({
          from: n.start - node.start,
          to: n.end - node.start,
          value: '(' + value + ')',
        });
        return;
      }
      // A destructured prop (`function Header({ isCustomer })`) reads as the attribute the parent
      // passed (ADR 0168).
      const passed = binding?.from?.value;
      // `{ isCustomer: customer }` reads the prop by its original name (ADR 0173).
      const propKey =
        binding?.steps?.length === 1 && typeof binding.steps[0].key === 'string'
          ? binding.steps[0].key
          : n.name;
      if (
        constants &&
        passed?.t === 'props' &&
        passed.attrs.has(propKey) &&
        !seen.has(passed.attrs.get(propKey))
      ) {
        const attr = passed.attrs.get(propKey);
        edits.push({
          from: n.start - node.start,
          to: n.end - node.start,
          value:
            '(' + boundText(attr.expr, attr.scope, evaluator, new Set([...seen, attr]), true) + ')',
        });
        return;
      }
      // `const isCustomer = me?.role === 'USER'`: a constant made of conditions reads as them (ADR 0168).
      const entry = found?.entry;
      const derived =
        constants && !binding?.expr && !seen.has(entry)
          ? hookCondition(entry, found?.scope, evaluator)
          : null;
      if (derived) {
        edits.push({
          from: n.start - node.start,
          to: n.end - node.start,
          value:
            '(' +
            boundText(derived.expr, derived.scope, evaluator, new Set([...seen, entry]), true) +
            ')',
        });
        return;
      }
      if (
        constants &&
        !binding?.expr &&
        entry?.kind === 'variable' &&
        entry.node.id?.type === 'Identifier' &&
        entry.node.init &&
        !(entry.steps ?? []).length &&
        !seen.has(entry) &&
        conditionOnly(entry.node.init)
      ) {
        edits.push({
          from: n.start - node.start,
          to: n.end - node.start,
          value:
            '(' +
            boundText(entry.node.init, found.scope, evaluator, new Set([...seen, entry]), true) +
            ')',
        });
        return;
      }
    }
    for (const [name, value] of Object.entries(n)) {
      if (!value || typeof value !== 'object') continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) visit(child, n, name);
      } else if (value.type) visit(value, n, name);
    }
  }
  visit(node, null, null);
  let result = source;
  for (const edit of edits.sort((a, b) => b.from - a.from))
    result = result.slice(0, edit.from) + edit.value + result.slice(edit.to);
  return result;
}

/** Only reads and comparisons: no call, assignment, function or markup. */
function conditionOnly(node) {
  if (!node?.type) return true;
  if (
    [
      'CallExpression',
      'OptionalCallExpression',
      'NewExpression',
      'AssignmentExpression',
      'UpdateExpression',
      'AwaitExpression',
      'ArrowFunctionExpression',
      'FunctionExpression',
      'JSXElement',
      'JSXFragment',
      'ObjectExpression',
      'ArrayExpression',
    ].includes(node.type)
  )
    return false;
  for (const [key, value] of Object.entries(node)) {
    if (
      ['loc', 'start', 'end', 'extra', 'comments', 'leadingComments', 'trailingComments'].includes(
        key,
      )
    )
      continue;
    if (Array.isArray(value)) {
      if (!value.every((child) => !child?.type || conditionOnly(child))) return false;
    } else if (value?.type && !conditionOnly(value)) return false;
  }
  return true;
}
/**
 * The condition behind a value taken from a hook (ADR 0173): `const { isCustomer } = useAuth()` when
 * the Context provider's value object holds `isCustomer: <condition>`, or `const isCustomer =
 * useRole()` when the hook is one `return <condition>`. Null otherwise.
 */
function hookCondition(entry, scope, evaluator) {
  if (entry?.kind !== 'variable' || !scope) return null;
  const init = unwrap(entry.node.init);
  if (init?.type !== 'CallExpression' || (entry.steps ?? []).some((s) => s.default || s.rest))
    return null;
  const steps = entry.steps ?? [];
  if (steps.length === 1 && typeof steps[0].key === 'string') {
    const value = evaluator.evaluate(init, scope);
    if (value?.t !== 'object' || value.node?.type !== 'ObjectExpression') return null;
    const property = value.node.properties.find(
      (p) =>
        p.type === 'ObjectProperty' &&
        !p.computed &&
        (p.key.type === 'Identifier' ? p.key.name : p.key.value) === steps[0].key,
    );
    if (!property || property.shorthand || !conditionOnly(property.value)) return null;
    return { expr: property.value, scope: value.scope };
  }
  if (steps.length || entry.node.id?.type !== 'Identifier') return null;
  const fn = evaluator.evaluate(init.callee, scope);
  if (fn?.t !== 'fn' || fn.node.params.length || fn.node.body?.type !== 'BlockStatement')
    return null;
  const returns = fn.node.body.body.filter((statement) => statement.type === 'ReturnStatement');
  if (returns.length !== 1 || fn.node.body.body.at(-1) !== returns[0] || !returns[0].argument)
    return null;
  if (!conditionOnly(returns[0].argument)) return null;
  return { expr: returns[0].argument, scope: evaluator.functionScope(fn.node, fn.scope, []) };
}
/** A condition rewritten over the facts it depends on: props and condition constants substituted. */
const factText = (node, scope, evaluator) => boundText(node, scope, evaluator, new Set(), true);

export {
  factText,
  hasContent,
  textual,
  intrinsicKind,
  labelOf,
  LABEL_ATTRIBUTES,
  literalAlternatives,
  boundText,
};
