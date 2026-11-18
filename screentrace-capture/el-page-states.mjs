/**
 * Which passing page state a JSP condition shows (ADR 0174): `empty`, `error` or `loading`, from
 * the few EL shapes below; anything else is not classified, so ordinary conditions (roles,
 * options) are never hidden. EL is short and has no nesting here, so the shapes are matched on
 * the expression text after the `${…}` wrapper and top-level `and` / `&&` are split.
 */
const PATH = String.raw`[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]*\])*`;
const ERROR = /error|^(load)?fail(ed|ure)?$/i;
const LOADING = /loading$|^(is)?(loading|fetching|busy)$/i;
const ORDER = ['loading', 'error', 'empty'];
const last = (path) => (path.match(/[A-Za-z_$][\w$]*/g) || ['']).at(-1);
const shapes = [
  [new RegExp(`^empty\\s+(${PATH})$`), (x) => (ERROR.test(last(x)) ? null : 'empty')],
  [
    new RegExp(`^(?:not\\s+empty|!\\s*empty)\\s+(${PATH})$`),
    (x) => (ERROR.test(last(x)) ? 'error' : null),
  ],
  [new RegExp(`^(${PATH})\\s*(?:!=|ne)\\s*null$`), (x) => (ERROR.test(last(x)) ? 'error' : null)],
  [new RegExp(`^fn:length\\(\\s*(${PATH})\\s*\\)\\s*(?:==|eq)\\s*0$`), () => 'empty'],
  [new RegExp(`^(${PATH})\\.size\\(\\)\\s*(?:==|eq)\\s*0$`), () => 'empty'],
  [new RegExp(`^(${PATH})\\.(?:isEmpty\\(\\)|empty)$`), () => 'empty'],
  [
    new RegExp(`^(${PATH})$`),
    (x) => (LOADING.test(last(x)) ? 'loading' : ERROR.test(last(x)) ? 'error' : null),
  ],
];

function classify(test) {
  const text = String(test || '').trim();
  const body = (/^[$#]\{([\s\S]*)\}$/.exec(text)?.[1] ?? text).trim();
  if (!body || body.startsWith('otherwise')) return null;
  const found = body
    .split(/\s+and\s+|\s*&&\s*/)
    .map((part) => {
      const atom = part
        .trim()
        .replace(/^\((.*)\)$/, '$1')
        .trim();
      for (const [shape, decide] of shapes) {
        const match = shape.exec(atom);
        if (match) return decide(match[1]);
      }
      return null;
    })
    .filter(Boolean);
  return ORDER.find((state) => found.includes(state)) ?? null;
}

/** The page state of content under these conditions, or null. */
export function elPageState(conditions = []) {
  const found = conditions.map(classify).filter(Boolean);
  return ORDER.find((state) => found.includes(state)) ?? null;
}
