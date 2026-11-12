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
function boundText(node, scope, evaluator, seen = new Set()) {
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
            ? '!!(' + boundText(expr.arguments[0], binding.scope, evaluator, next) + ')'
            : boundText(expr, binding.scope, evaluator, next);
        edits.push({
          from: n.start - node.start,
          to: n.end - node.start,
          value: '(' + value + ')',
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

export {
  hasContent,
  textual,
  intrinsicKind,
  labelOf,
  LABEL_ATTRIBUTES,
  literalAlternatives,
  boundText,
};
