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
  // Thymeleaf utility objects (ADR 0181): `#lists.isEmpty(x)`, `#lists.size(x) == 0`, form errors.
  [new RegExp(`^#(?:lists|arrays|sets|maps)\\.isEmpty\\(\\s*(${PATH})\\s*\\)$`), () => 'empty'],
  [
    new RegExp(`^#(?:lists|arrays|sets|maps)\\.size\\(\\s*(${PATH})\\s*\\)\\s*(?:==|eq)\\s*0$`),
    () => 'empty',
  ],
  [/^#fields\.(?:hasErrors|hasAnyErrors|hasGlobalErrors)\(([^()]*)\)$/, () => 'error'],
  [
    new RegExp(`^(${PATH})$`),
    (x) => (LOADING.test(last(x)) ? 'loading' : ERROR.test(last(x)) ? 'error' : null),
  ],
];

function classify(test) {
  const text = String(test || '').trim();
  const body = (/^[$#*]\{([\s\S]*)\}$/.exec(text)?.[1] ?? text).trim();
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

/**
 * The page state of a Thymeleaf element (ADR 0181): `th:if` as a condition; `th:unless` only when
 * it negates (`${not empty x}`, `${!x}`), read as the condition without the negation.
 */
export function thymeleafPageState(thIf, thUnless) {
  const conditions = [];
  if (thIf) conditions.push(thIf);
  const unless = /^\$\{\s*(?:!|not\s+)([^]*)\}$/.exec(String(thUnless || '').trim());
  if (unless && !/^\s*empty\s/.test(unless[1]) && !/[&|]|\s(?:and|or)\s/.test(unless[1]))
    conditions.push('${' + unless[1].trim() + '}');
  else if (/^\$\{\s*not\s+empty\s+([^]*)\}$/.test(String(thUnless || '').trim()))
    conditions.push(
      String(thUnless)
        .trim()
        .replace(/^\$\{\s*not\s+/, '${'),
    );
  return elPageState(conditions);
}

/**
 * The page state a Struts `logic:` tag puts its content in (ADR 0181): `logic:empty` an empty list,
 * `logic:messagesPresent` (errors, not `message="true"`) and `logic:notEmpty`/`logic:present` on
 * an error bean an error. Other logic tags say nothing.
 */
export function strutsLogicPageState(name, attributes = {}) {
  // Markup tokens may lower-case tag names: `messagesPresent` arrives as `messagespresent`.
  const tag =
    {
      messagespresent: 'messagesPresent',
      notempty: 'notEmpty',
    }[String(name).toLowerCase()] ?? String(name).toLowerCase();
  const path = [attributes.name, attributes.property].filter(Boolean).join('.');
  if (tag === 'messagesPresent') return attributes.message === 'true' ? null : 'error';
  if (!/^[A-Za-z_$][\w$.]*$/.test(path)) return null;
  if (tag === 'empty') return elPageState(['${empty ' + path + '}']);
  if (tag === 'notEmpty') return elPageState(['${not empty ' + path + '}']);
  if (tag === 'present') return elPageState(['${' + path + ' != null}']);
  return null;
}

/** The page state of content under these conditions, or null. */
export function elPageState(conditions = []) {
  const found = conditions.map(classify).filter(Boolean);
  return ORDER.find((state) => found.includes(state)) ?? null;
}
