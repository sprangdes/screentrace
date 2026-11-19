import { Node } from './contracts';
export interface NameHint {
  title?: string;
  heading?: string;
}
/** What else can name a screen in plain words (ADR 0163). */
export interface NameContext {
  /** The text of links and buttons that lead to each screen, one entry per link. */
  linkLabels?: Map<string, { label: string; from: string }[]>;
  /** The roles each screen is for, from the analysis's personas. */
  roles?: Map<string, string[]>;
}
/** `lineLogin=failed|success` → `網址帶 lineLogin=failed 或 success`. */
export function queryText(query: string): string {
  return `網址帶 ${query
    .split('&')
    .filter(Boolean)
    .map((part) => part.split('|').join(' 或 '))
    .join('、')}`;
}
/** `step = 2` → `step 為 2`. */
export const stateText = (variant: string) => variant.replace(/\s*={1,3}\s*/g, ' 為 ');
const unsafeSourceMarkup =
  /(?:data-st-|<\/?[a-z][\w.-]*:[^>]*>|<\/?[a-z][\w.-]*\b[^>]*\bdata-st-[^>]*>)/iu;
// The static preview shows unproven text as this sample value; it never names a screen.
const SAMPLE_TEXT = '示例值';
const clean = (value?: string) => {
  const text = String(value || '');
  if (unsafeSourceMarkup.test(text) || text.includes(SAMPLE_TEXT)) return '';
  return text
    .replace(/\$\{[^{}]*\}|#\{[^{}]*\}|<%[\s\S]*?%>/g, '動態內容')
    .replace(/\s+/g, ' ')
    .trim();
};
export function humanizeName(value: string): string {
  if (unsafeSourceMarkup.test(value)) return '未命名畫面';
  const filename = value
    .split(/[\\/]/)
    .at(-1)!
    .replace(/\.[^.]+$/, '');
  return (
    clean(
      filename
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .replace(/[_-]+/g, ' '),
    ).replace(/\b[a-z]/g, (s) => s.toUpperCase()) || '未命名畫面'
  );
}
// A heading shared by a few screens still names each of them (the route tells them apart); one shared by
// more is a layout heading, not a page title.
const SHARED_HEADING_LIMIT = 5;
/** Display-only names; graph IDs, evidence and exported source-derived names stay intact. */
export function screenNames(
  screens: Node[],
  hints: Map<string, NameHint>,
  routes: Map<string, string[]>,
  context: NameContext = {},
): Map<string, string> {
  const sorted = [...screens].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    counts = new Map<string, number>();
  for (const screen of sorted)
    for (const value of new Set(
      [clean(hints.get(screen.id)?.title), clean(hints.get(screen.id)?.heading)].filter(Boolean),
    ))
      counts.set(value, (counts.get(value) || 0) + 1);
  const linkName = linkNames(context.linkLabels);
  const names = new Map<string, string>();
  for (const screen of sorted) {
    const hint = hints.get(screen.id) || {},
      title = clean(hint.title),
      heading = clean(hint.heading),
      duplicate = !!title && counts.get(title)! > 1;
    const fallback =
      screen.attributes.view ||
      screen.attributes.viewIdentifier ||
      screen.source?.file ||
      screen.name;
    const tileName =
      screen.attributes.tilesDefinition === 'true'
        ? clean(screen.attributes.screenName || screen.name)
        : '';
    names.set(
      screen.id,
      tileName ||
        (title && counts.get(title) === 1
          ? title
          : heading && counts.get(heading)! <= SHARED_HEADING_LIMIT
            ? heading
            : duplicate || screen.attributes.view
              ? linkName.get(screen.id) || humanizeName(fallback)
              : clean(screen.attributes.screenName || screen.name) || humanizeName(fallback)),
    );
  }
  // A route that only forwards elsewhere is named after where it goes.
  for (const screen of sorted) {
    const targets = screen.attributes.redirectTargets;
    if (targets === undefined) continue;
    const first = targets.split('|').filter(Boolean)[0],
      target = first && first !== screen.id ? names.get(first) : undefined,
      wildcard = (routes.get(screen.id) || []).some((route) => route.includes('*'));
    names.set(screen.id, target ? `${wildcard ? '其他網址' : ''}轉址到「${target}」` : '轉址頁');
  }
  // The steps of one page share its title; each is named with the page state it shows.
  for (const screen of sorted)
    if (screen.attributes.stateVariant)
      names.set(
        screen.id,
        `${names.get(screen.id)}（${screen.attributes.jspStateLabel || stateText(screen.attributes.stateVariant)}）`,
      );
  const byId = new Map(screens.map((screen) => [screen.id, screen])),
    groups = new Map<string, string[]>();
  for (const [id, name] of names) groups.set(name, [...(groups.get(name) || []), id]);
  for (const [name, group] of groups)
    if (group.length > 1) {
      // Screens opened with a query are told apart by it; the rest still share the name.
      const queryIds = group.filter((id) => byId.get(id)?.attributes.entryQuery);
      for (const id of queryIds) {
        const query = byId.get(id)!.attributes.entryQuery;
        names.set(id, `${name}（${queryText(query)}）`);
      }
      const ids = group.filter((id) => !queryIds.includes(id));
      if (ids.length < 2) continue;
      const candidates = new Map(
        ids.map((id) => {
          const screen = byId.get(id),
            source =
              screen?.attributes.screenNameSourcePath ||
              screen?.attributes.view ||
              screen?.source?.file;
          return [
            id,
            [
              screen?.attributes.entryQuery ? queryText(screen.attributes.entryQuery) : undefined,
              context.roles?.get(id)?.length ? context.roles.get(id)!.join('、') : undefined,
              routes.get(id)?.[0],
              clean(screen?.attributes.tilesDefinitionName).replace(/^\.+/, ''),
              sourceFileName(source),
              sourceDirectoryName(source),
            ],
          ];
        }),
      );
      // Facts people read (query, role, route, Tiles name) first, alone then in pairs; the source file
      // and folder only when those cannot tell the screens apart (ADR 0177).
      const PLAIN = 4;
      for (const id of ids) {
        const list = candidates.get(id)!,
          plain = list.slice(0, PLAIN).filter(Boolean) as string[],
          files = list.slice(PLAIN).filter(Boolean) as string[];
        const alone = (values: string[]) =>
          values.find(
            (value) => ids.filter((other) => candidates.get(other)!.includes(value)).length === 1,
          );
        const shared = (a: string, b: string) =>
          ids.filter((other) => {
            const values = candidates.get(other)!;
            return values.includes(a) && values.includes(b);
          }).length;
        let label = alone(plain);
        for (let i = 0; i < plain.length && !label; i++)
          for (let j = i + 1; j < plain.length && !label; j++)
            if (shared(plain[i], plain[j]) === 1) label = `${plain[i]}・${plain[j]}`;
        label ??= alone(files);
        if (label) names.set(id, `${name}（${label}）`);
      }
    }
  return names;
}
/**
 * A screen without a title is named by the links that lead to it: the label that leads only here,
 * or most often here, from the most screens. A label also used for other screens (a logo) loses to
 * one that is specific to this screen.
 */
function linkNames(labels?: Map<string, { label: string; from: string }[]>): Map<string, string> {
  const out = new Map<string, string>();
  if (!labels) return out;
  const targets = new Map<string, Set<string>>();
  for (const [id, list] of labels)
    for (const { label } of list) {
      const text = clean(label);
      if (text) targets.set(text, new Set([...(targets.get(text) || []), id]));
    }
  for (const [id, list] of labels) {
    const from = new Map<string, Set<string>>();
    for (const { label, from: source } of list) {
      const text = clean(label);
      if (text && !/^<.*>$/.test(text))
        from.set(text, new Set([...(from.get(text) || []), source]));
    }
    const best = [...from]
      .map(([text, sources]) => ({ text, sources: sources.size, targets: targets.get(text)!.size }))
      .sort(
        (a, b) =>
          a.targets - b.targets ||
          b.sources - a.sources ||
          (a.text < b.text ? -1 : a.text > b.text ? 1 : 0),
      )[0];
    if (best) out.set(id, best.text);
  }
  return out;
}
function sourceDirectoryName(path?: string): string {
  const parts = String(path || '')
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean);
  if (parts.length < 2) return '';
  const directory = parts.at(-2)!;
  return directory === 'views' || directory === 'jsp' || directory === 'webapp'
    ? ''
    : humanizeName(directory);
}
function sourceFileName(path?: string): string {
  const filename =
    String(path || '')
      .replaceAll('\\', '/')
      .split('/')
      .filter(Boolean)
      .at(-1) || '';
  return filename ? humanizeName(filename) : '';
}
