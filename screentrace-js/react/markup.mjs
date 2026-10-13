/**
 * Static HTML for a reconstructed React screen. Every name and value is escaped here; event handlers,
 * scripts and raw-HTML props never reach the output, so the document is inert without JavaScript.
 */
export const SAMPLE_TEXT = '示例值';
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const DROPPED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'frame', 'frameset', 'base', 'meta', 'link', 'noscript', 'template', 'portal']);
const DROPPED_ATTRIBUTES = new Set(['key', 'ref', 'children', 'dangerouslySetInnerHTML', 'suppressHydrationWarning', 'suppressContentEditableWarning', 'srcDoc', 'srcdoc', 'src', 'srcSet', 'formAction', 'action', 'ping', 'background', 'poster', 'data']);
const RENAMED = {className: 'class', htmlFor: 'for', tabIndex: 'tabindex', readOnly: 'readonly', autoComplete: 'autocomplete', autoFocus: 'autofocus',
  maxLength: 'maxlength', minLength: 'minlength', colSpan: 'colspan', rowSpan: 'rowspan', defaultValue: 'value', defaultChecked: 'checked', inputMode: 'inputmode',
  crossOrigin: 'crossorigin', spellCheck: 'spellcheck', contentEditable: 'contenteditable', enterKeyHint: 'enterkeyhint', noValidate: 'novalidate', acceptCharset: 'accept-charset'};
const UNITLESS = new Set(['opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flex', 'flexGrow', 'flexShrink', 'order', 'zoom', 'gridRow', 'gridColumn', 'columnCount', 'orphans', 'widows', 'tabSize']);

export function element(tag, attributes = {}) {
  return {tag, attributes, children: []};
}

export function isAllowedTag(tag) {
  return /^[a-z][a-z0-9-]*$/.test(tag) && !DROPPED_TAGS.has(tag);
}

/** HTML attribute name/value for a JSX prop, or null when the prop must not or cannot appear statically. */
export function htmlAttribute(name, value) {
  if (/^on[A-Z]/.test(name) || DROPPED_ATTRIBUTES.has(name)) return null;
  const html = RENAMED[name] ?? (/^(aria|data)-/.test(name) ? name : name.toLowerCase());
  if (!/^[a-z][a-z0-9_:.-]*$/.test(html) || html.startsWith('on')) return null;
  if (value === true) return [html, ''];
  if (value === false || value === null || value === undefined) return null;
  const textValue = String(value);
  if (html === 'href' && !/^(\/|#|https?:|mailto:|tel:)/i.test(textValue.trim()) && !/^[\w.-]+(\/|$)/.test(textValue.trim())) return null;
  return [html, textValue];
}

/** `style={{ minWidth: 44, color: 'red' }}` as CSS text; entries that are not literals are left out. */
export function styleText(entries) {
  return entries.filter(([, value]) => value !== null && value !== undefined && value !== false && value !== '')
    .map(([key, value]) => {
      const property = key.startsWith('--') ? key : key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()).replace(/^ms-/, '-ms-');
      const text = typeof value === 'number' && value !== 0 && !UNITLESS.has(key) ? `${value}px` : String(value);
      return /^[-a-z0-9]+$/i.test(property) && !/[<>{};]|url\s*\(|expression\s*\(/i.test(text) ? `${property}:${text}` : null;
    }).filter(Boolean).join(';');
}

/** JSX text whitespace rules: lines are trimmed and joined with a space, blank lines removed. */
export function jsxText(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  if (lines.length === 1) return raw;
  return lines.map((line, index) => {
    let value = line;
    if (index > 0) value = value.replace(/^[ \t]+/, '');
    if (index < lines.length - 1) value = value.replace(/[ \t]+$/, '');
    return value;
  }).filter(Boolean).join(' ');
}

function escapeText(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, '&quot;');
}

export function serialize(node) {
  if (typeof node === 'string') return escapeText(node);
  if (!node.tag) return node.children.map(serialize).join('');
  const attributes = Object.keys(node.attributes).sort().map(name => node.attributes[name] === '' ? ` ${name}` : ` ${name}="${escapeAttribute(node.attributes[name])}"`).join('');
  if (VOID.has(node.tag)) return `<${node.tag}${attributes}>`;
  return `<${node.tag}${attributes}>${node.children.map(serialize).join('')}</${node.tag}>`;
}
