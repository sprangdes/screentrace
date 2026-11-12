import { children, line } from './modules.mjs';

/** Per JSX element: a stable key (file, name, same-name occurrence) and a readable anchor (file:line, #n when a line holds several). */
function jsxOccurrences(modules) {
  const keys = new Map(),
    anchors = new Map();
  for (const module of modules.values()) {
    const counts = new Map(),
      lines = new Map();
    const elements = [];
    const visit = (node) => {
      if (node.type === 'JSXElement') {
        const name = jsxName(node.openingElement.name);
        const count = counts.get(name) ?? 0;
        counts.set(name, count + 1);
        keys.set(node, `${module.file}#${name}#${count}`);
        elements.push(node);
        lines.set(line(node), (lines.get(line(node)) ?? 0) + 1);
      }
      for (const child of children(node)) visit(child);
    };
    visit(module.ast.program);
    const ordinals = new Map();
    for (const node of elements.sort((a, b) => a.start - b.start)) {
      const at = line(node),
        ordinal = (ordinals.get(at) ?? 0) + 1;
      ordinals.set(at, ordinal);
      anchors.set(node, `${module.file}:${at}${lines.get(at) > 1 ? '#' + ordinal : ''}`);
    }
  }
  return { keys, anchors };
}
function jsxName(name) {
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') return jsxName(name.object) + '.' + name.property.name;
  if (name.type === 'JSXNamespacedName') return name.namespace.name + ':' + name.name.name;
  return '?';
}
function attribute(element, name) {
  return (
    element.openingElement.attributes.find(
      (item) => item.type === 'JSXAttribute' && jsxName(item.name) === name,
    ) ?? null
  );
}
/** The expression an attribute carries: `x="a"` is a literal, a bare `x` is `true`. */
function attributeExpression(item) {
  if (!item) return null;
  if (!item.value) return { type: 'BooleanLiteral', value: true };
  if (item.value.type === 'JSXExpressionContainer')
    return item.value.expression.type === 'JSXEmptyExpression' ? null : item.value.expression;
  return item.value;
}

export { jsxOccurrences, jsxName, attribute, attributeExpression };
