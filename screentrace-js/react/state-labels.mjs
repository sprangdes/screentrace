import { parseModules } from './modules.mjs';
import { walk } from '../bindings.mjs';

/**
 * Words the frontend shows for backend constants (ADR 0160): an object keyed by constants, an
 * array of `{ value, label }` items, or the `<option>`s of one `<select>`. Only literal text is
 * read and only text with a non-ASCII character counts as a label, so icon names and CSS classes
 * are not mistaken for words. Each group is reported with its source; matching groups to an enum
 * and resolving disagreements is left to the Java side, which knows the enums.
 */
const CONSTANT = /^[A-Z][A-Z0-9_]*$/;
const LABEL_KEYS = ['label', 'text', 'name', 'title'];
const VALUE_KEYS = ['value', 'key', 'id', 'code', 'status'];

const literal = (node) => {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis.map((q) => q.value.cooked ?? '').join('');
  return undefined;
};
const word = (value) =>
  typeof value === 'string' &&
  [...value].some((c) => c.codePointAt(0) > 0x7f) &&
  value.trim().length <= 40
    ? value.trim()
    : undefined;
const keyOf = (property) => {
  if (property.type !== 'ObjectProperty' || property.computed) return undefined;
  if (property.key.type === 'Identifier') return property.key.name;
  return literal(property.key);
};
const field = (object, names) => {
  for (const property of object.properties ?? []) {
    const key = keyOf(property);
    if (key && names.includes(key)) {
      const value = literal(property.value);
      if (value !== undefined) return value;
    }
  }
  return undefined;
};
const jsxText = (children) =>
  children
    .map((child) =>
      child.type === 'JSXText'
        ? child.value
        : child.type === 'JSXExpressionContainer'
          ? (literal(child.expression) ?? '\u0000')
          : '\u0000',
    )
    .join('');

/** `{ PENDING: '待確認' }` or `{ PENDING: { label: '待確認' } }`. */
function fromObject(node) {
  const entries = {};
  for (const property of node.properties) {
    const key = keyOf(property);
    if (!key || !CONSTANT.test(key)) return undefined;
    const label =
      property.value.type === 'ObjectExpression'
        ? word(field(property.value, LABEL_KEYS))
        : word(literal(property.value));
    if (!label) return undefined;
    entries[key] = label;
  }
  return entries;
}

/** `[{ value: 'PENDING', label: '待確認' }]`. */
function fromArray(node) {
  const entries = {};
  for (const item of node.elements) {
    if (item?.type !== 'ObjectExpression') return undefined;
    const key = field(item, VALUE_KEYS),
      label = word(field(item, LABEL_KEYS));
    if (!key || !CONSTANT.test(key) || !label) return undefined;
    entries[key] = label;
  }
  return entries;
}

/** The `<option value="PENDING">待確認</option>` children of one `<select>`. */
function fromSelect(node) {
  const entries = {};
  for (const child of node.children) {
    if (child.type !== 'JSXElement') continue;
    if (child.openingElement.name?.name !== 'option') continue;
    const attribute = child.openingElement.attributes.find(
      (a) => a.type === 'JSXAttribute' && a.name?.name === 'value',
    );
    const value =
      attribute?.value?.type === 'JSXExpressionContainer'
        ? literal(attribute.value.expression)
        : literal(attribute?.value);
    if (value === '' || value === undefined) continue; // the "all" option
    const text = jsxText(child.children);
    if (!CONSTANT.test(value) || text.includes('\u0000')) return undefined;
    const label = word(text);
    if (!label) return undefined;
    entries[value] = label;
  }
  return entries;
}

export function analyzeStateLabels({ files = [] } = {}) {
  const { modules } = parseModules(files);
  const groups = [];
  for (const module of [...modules.values()].sort((a, b) => a.file.localeCompare(b.file)))
    walk(module.ast.program, (node) => {
      let entries;
      if (node.type === 'ObjectExpression' && node.properties.length >= 2)
        entries = fromObject(node);
      else if (node.type === 'ArrayExpression' && node.elements.length >= 2)
        entries = fromArray(node);
      else if (node.type === 'JSXElement' && node.openingElement.name?.name === 'select')
        entries = fromSelect(node);
      if (entries && Object.keys(entries).length >= 2)
        groups.push({
          source: { file: module.file, line: node.loc?.start.line ?? 1 },
          entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : 1))),
        });
    });
  return { groups };
}
