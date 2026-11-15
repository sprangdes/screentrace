const FETCHING = new Set([
  'src',
  'srcset',
  'href',
  'poster',
  'data',
  'srcdoc',
  'action',
  'formaction',
  'background',
  'xlink:href',
  'http-equiv',
]);
/** Elements whose content the HTML tokenizer reads as text up to the matching end tag. */
const RAW_TEXT = new Set([
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
]);
const INERT = 'data-st-inert-';
/** HTML's whitespace is ASCII only; `\s` would also split on `\v` and NBSP. */
const space = (c: string | undefined) =>
  c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';

/** Where a comment opened at `i` ends, following the tokenizer: `<!-->` and `<!--->`
 * close at once, otherwise the first `-->` or `--!>`; an unclosed one runs to `to`. */
function commentEnd(html: string, i: number, to: number): number {
  if (html.startsWith('>', i + 4)) return i + 5;
  if (html.startsWith('->', i + 4)) return i + 6;
  for (let j = i + 4; j < to; j++)
    if (html.startsWith('--', j)) {
      if (html[j + 2] === '>') return Math.min(j + 3, to);
      if (html.startsWith('!>', j + 2)) return Math.min(j + 4, to);
    }
  return to;
}

/** Where raw text opened by `name` at `from` ends: the first `</name` followed by
 * whitespace, `/` or `>`, ignoring case. */
function rawTextEnd(html: string, lower: string, name: string, from: number, to: number): number {
  const close = '</' + name;
  for (let j = lower.indexOf(close, from); j >= 0 && j < to; j = lower.indexOf(close, j + 1)) {
    const after = html[j + close.length];
    if (after === undefined || after === '/' || after === '>' || space(after)) return j;
  }
  return to;
}

/** Rename fetching attributes of every start tag in `html[from, to)`. Constructs left
 * open (a quote, a comment) end at `to`, so raw text never swallows the markup after it. */
function lex(html: string, lower: string, from: number, to: number): string {
  let result = '',
    i = from;
  while (i < to) {
    if (html.startsWith('<!--', i)) {
      const next = commentEnd(html, i, to);
      result += html.slice(i, next);
      i = next;
      continue;
    }
    if (html[i] !== '<' || !/[a-z]/i.test(html[i + 1] || '') || i + 1 >= to) {
      result += html[i++];
      continue;
    }
    result += html[i++];
    const tagStart = i;
    while (i < to && !space(html[i]) && html[i] !== '/' && html[i] !== '>') result += html[i++];
    const tag = html.slice(tagStart, i).toLowerCase();
    while (i < to && html[i] !== '>') {
      if (space(html[i]) || html[i] === '/') {
        result += html[i++];
        continue;
      }
      const start = i;
      i++;
      while (i < to && !space(html[i]) && !'=/>'.includes(html[i])) i++;
      const name = html.slice(start, i),
        lower = name.toLowerCase();
      result += FETCHING.has(lower) ? INERT + lower.replace(':', '-') : name;
      while (i < to && space(html[i])) result += html[i++];
      if (html[i] === '=' && i < to) {
        result += html[i++];
        while (i < to && space(html[i])) result += html[i++];
        const quote = html[i];
        if (quote === '"' || quote === "'") {
          result += html[i++];
          while (i < to && html[i] !== quote) result += html[i++];
          if (i < to) result += html[i++];
        } else while (i < to && !space(html[i]) && html[i] !== '>') result += html[i++];
      }
    }
    if (i < to && html[i] === '>') result += html[i++];
    if (tag === 'plaintext') {
      result += lex(html, lower, i, to);
      i = to;
    } else if (RAW_TEXT.has(tag)) {
      const end = rawTextEnd(html, lower, tag, i, to);
      result += lex(html, lower, i, end);
      i = end;
    }
  }
  return result;
}

/** Whether a fetching attribute may keep its value: links and form targets (the frame
 * blocks navigation), embedded images and embedded stylesheets. */
function allowed(node: Element, key: string, value: string): boolean {
  if (key === 'href' && (node.tagName === 'A' || node.tagName === 'AREA')) return true;
  if (key === 'action' || key === 'formaction') return true;
  if (
    (key === 'src' || key === 'poster' || key === 'background') &&
    /^data:image\/[\w+.-]+[;,]/i.test(value)
  )
    return true;
  return key === 'href' && node.tagName === 'LINK' && /^data:text\/css;base64,/i.test(value);
}

/** Neutralize fetching attributes before DOMParser: even detached HTML documents may
 * preload images. The lexical pass only renames attributes; DOMParser still owns HTML
 * parsing. Where the two read the markup differently, a fetching attribute can reach the
 * document under its own name, so the same rule applies to it after parsing: a fetching
 * value stays only for links, form targets and embedded data URIs. */
export function inertDocument(html: string): Document {
  const doc = new DOMParser().parseFromString(
    lex(
      html,
      html.replace(/[A-Z]+/g, (c) => c.toLowerCase()),
      0,
      html.length,
    ),
    'text/html',
  );
  for (const node of doc.querySelectorAll('*'))
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase(),
        key = name.startsWith(INERT)
          ? name.slice(INERT.length)
          : FETCHING.has(name)
            ? name.replace(':', '-')
            : undefined;
      if (key === undefined) continue;
      const value = attr.value;
      node.removeAttributeNode(attr);
      if (allowed(node, key, value)) node.setAttribute(key, value);
    }
  return doc;
}
