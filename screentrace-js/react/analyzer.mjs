import { parseModules, diagnostic, line } from './modules.mjs';
import { Evaluator } from './values.mjs';
import { atoms, unique, combinations, contradicts, simplify } from './audience.mjs';
import { contextTransfers } from './context-transfer.mjs';
import { stylesheets } from './styles.mjs';
import { personaDimensions, normalizePersonas, applyPersonas } from './personas.mjs';
import { expandScalarCondition } from './branches.mjs';
import { jsxOccurrences } from './jsx.mjs';
import {
  findQueryEntryInSources,
  findRoutes,
  findRootRender,
  routePattern,
  matchRoute,
  queryEntryTargets,
} from './routes.mjs';
import { ScreenRenderer } from './screen-renderer.mjs';

/**
 * Static React analysis: routes, the component tree each route renders, interactive elements and what
 * their handlers do. Target code is parsed, never run; values that cannot be proven stay unresolved.
 */
export function analyzeReact({ files = [], maxDepth = 24, markup = false, personas } = {}) {
  const { modules, diagnostics } = parseModules(files);
  const evaluator = new Evaluator(modules, maxDepth);
  evaluator.transferContext = contextTransfers(modules, evaluator);
  evaluator.expandAudience = (node, scope) => expandScalarCondition(node, scope, evaluator);
  const occurrences = jsxOccurrences(modules);
  const routes = findRoutes(modules, evaluator, diagnostics);
  const shell = findRootRender(modules, evaluator);
  const screens = [],
    routeRedirects = [],
    entryBranches = [],
    seen = new Map();
  for (const route of routes) {
    const duplicate = seen.get(route.path);
    if (duplicate) {
      diagnostics.push(
        diagnostic(
          route.file,
          route.line,
          'REACT_DUPLICATE_ROUTE',
          `路由 ${route.path} 重複宣告；沿用 ${duplicate.file}:${duplicate.line}`,
        ),
      );
      continue;
    }
    seen.set(route.path, route);
    const base = new ScreenRenderer(evaluator, occurrences, diagnostics, maxDepth, false).render(
      route,
      shell,
    );
    const ordinaryVariants = base.variantDecision ?? [null];
    const queryEntry = findQueryEntryInSources(base.audienceOriginal, modules, base.file);
    const variants = queryEntry
      ? ordinaryVariants.flatMap((original) => {
          const inherited = original?.facts ?? base.audienceOriginal;
          const rest = inherited.filter((fact) => fact.text !== queryEntry.atom.text);
          const entryScope = evaluator.transferContext.scopeOf(queryEntry.atom),
            scoped = (list) =>
              entryScope ? evaluator.transferContext.remember(list, entryScope) : list;
          const queryDefaults = scoped(atoms(`!(${queryEntry.aText})`, queryEntry.atom.source));
          return [
            {
              facts: unique([
                ...rest,
                ...queryDefaults,
                ...scoped(atoms(queryEntry.bText, queryEntry.atom.source)),
              ]),
              queryEntryPlain: true,
              queryDefaults,
              ...(original?.facts ? { baseVariant: original } : {}),
            },
            {
              facts: unique([...rest, ...scoped(atoms(queryEntry.aText, queryEntry.atom.source))]),
              entryQuery: `${queryEntry.key}=${queryEntry.values.sort().join('|')}`,
              ...(original?.facts ? { baseVariant: original } : {}),
            },
          ];
        })
      : ordinaryVariants;
    entryBranches.push(
      ...base.load.filter((e) => e.redirect).map((effect) => ({ route: route.path, effect })),
    );
    routeRedirects.push(
      ...base.load
        .filter(
          (e) =>
            e.routeRedirect || (e.redirect && e.shellRouteFacts && !contradicts(e.shellRouteFacts)),
        )
        .map((effect) => ({ route: route.path, file: route.file, effect })),
    );
    for (const variant of variants) {
      const initial = new ScreenRenderer(
        evaluator,
        occurrences,
        diagnostics,
        maxDepth,
        false,
        variant?.facts ?? (base.redirectOnly ? [] : base.audienceOriginal),
      ).render(route, shell);
      const screen = new ScreenRenderer(
        evaluator,
        occurrences,
        diagnostics,
        maxDepth,
        markup,
        base.redirectOnly ? [] : initial.audienceOriginal,
      ).render(route, shell);
      if (queryEntry && variant) {
        screen.audience = unique([
          ...screen.audience.filter((fact) => fact.text !== queryEntry.atom.text),
          ...variant.facts,
        ]);
        screen.audienceOriginal = unique([
          ...screen.audienceOriginal.filter((fact) => fact.text !== queryEntry.atom.text),
          ...variant.facts,
        ]);
      }
      if (variant?.baseVariant)
        screen.variantKey = JSON.stringify(
          unique(variant.baseVariant.facts).map((a) => [a.text, a.truth]),
        );
      else if (variant && !variant.queryEntryPlain && !variant.entryQuery)
        screen.variantKey = JSON.stringify(unique(variant.facts).map((a) => [a.text, a.truth]));
      if (variant?.entryQuery) screen.entryQuery = variant.entryQuery;
      if (variant?.queryEntryPlain) {
        screen.queryEntryPlain = true;
        screen.queryDefaults = variant.queryDefaults;
      }
      const present = new Set(screen.components.map((c) => c.key));
      screen.excluded = base.components
        .filter((c) => !present.has(c.key))
        .map((component) => ({
          ...component,
          source: { file: component.file, line: component.line },
          audience: screen.audience,
          reason: '此身分下不顯示',
        }));
      screen.audienceSummary = simplify(screen.audience);
      delete screen.variantDecision;
      screens.push(screen);
    }
  }
  const navigationFacts = new WeakMap();
  const patterns = screens.map((screen) => ({
    route: screen.route,
    pattern: routePattern(screen.route),
  }));
  for (const screen of [
    ...screens,
    { load: routeRedirects.map((r) => r.effect), components: [] },
  ]) {
    for (const effect of [
      ...screen.load,
      ...screen.components.flatMap((component) => component.behaviors),
    ])
      if (effect.type === 'NAVIGATE') {
        const before = effect.status;
        Object.assign(
          effect,
          matchRoute(
            effect.urls,
            effect.fullPage ? patterns.filter((item) => !item.route.includes('*')) : patterns,
          ),
        );
        if (before === 'INFERRED' && effect.status === 'CONFIRMED') effect.status = 'INFERRED';
        const blocked = effect.contextWrites ?? [],
          ctx = evaluator.transferContext;
        const facts = [
          ...ctx.navigationFacts(screen.audience ?? [], blocked),
          ...(effect.contextGuardFacts ?? []).filter(
            (a) => !blocked.some((id) => a.text.includes('$context' + id.split('#')[1] + '_')),
          ),
          ...(effect.contextIdentity ? (effect.destinationFacts ?? []) : []),
        ];
        navigationFacts.set(effect, facts);
        let candidates = screens.filter((s) => (effect.targetRoutes ?? []).includes(s.route));
        const entryTargets = queryEntryTargets(effect.entryUrls ?? effect.urls, candidates);
        if (entryTargets) {
          candidates = entryTargets;
          if (
            screens.some((s) => (effect.targetRoutes ?? []).includes(s.route) && s.entryQuery) &&
            screens.some((s) => (effect.targetRoutes ?? []).includes(s.route) && s.queryEntryPlain)
          )
            effect.targetScreens = entryTargets.map((s) => ({
              file: s.file,
              route: s.route,
              ...(s.variantKey ? { variantKey: s.variantKey } : {}),
              ...(s.entryQuery ? { entryQuery: s.entryQuery } : {}),
            }));
        }
        // Preserve the historical projection for graphs without any Context identity evidence.
        if (candidates.length && facts.length) {
          effect.excludedTargets = [];
          effect.targetScreens = candidates
            .filter((target) => {
              const targetFacts = ctx.navigationFacts(target.audience);
              if (!targetFacts.length || !contradicts([...facts, ...targetFacts])) return true;
              effect.excludedTargets.push({
                file: target.file,
                route: target.route,
                ...(target.variantKey ? { variantKey: target.variantKey } : {}),
                reason: '同一 Context 值的來源與目的身分條件矛盾',
                sourceFacts: facts,
                targetFacts,
              });
              return false;
            })
            .map((s) => ({
              file: s.file,
              route: s.route,
              ...(s.variantKey ? { variantKey: s.variantKey } : {}),
              ...(s.entryQuery ? { entryQuery: s.entryQuery } : {}),
            }));
        }
        if (effect.excludedTargets?.length) effect.status = 'INFERRED';
        if (effect.contextIdentity && !effect.targetScreens)
          effect.targetScreens = candidates
            .filter(
              (s) =>
                !contradicts([...(effect.destinationFacts ?? []), ...ctx.targetFacts(s.audience)]),
            )
            .map((s) => ({
              file: s.file,
              route: s.route,
              ...(s.variantKey ? { variantKey: s.variantKey } : {}),
            }));
        effect.targetConditions = (effect.targetScreens ?? candidates)
          .map((candidate) => {
            const target = candidates.find(
              (s) =>
                s.file === candidate.file &&
                s.route === candidate.route &&
                s.variantKey === candidate.variantKey &&
                s.entryQuery === candidate.entryQuery,
            );
            if (
              !ctx.navigationFacts(screen.audience ?? []).length &&
              !ctx.navigationFacts(target?.audience ?? []).length &&
              !effect.contextIdentity
            )
              return null;
            return {
              file: candidate.file,
              route: candidate.route,
              ...(candidate.variantKey ? { variantKey: candidate.variantKey } : {}),
              ...(candidate.entryQuery ? { entryQuery: candidate.entryQuery } : {}),
              ...ctx.explain(blocked.length ? [] : (screen.audience ?? []), target?.audience ?? []),
            };
          })
          .filter(Boolean);
        // A full-page load of a server URL that is not a client route reaches the backend: treat it as a GET request.
        if (
          effect.fullPage &&
          effect.status === 'UNRESOLVED' &&
          effect.urls.length &&
          effect.urls.every((url) => url.startsWith('/'))
        ) {
          Object.assign(effect, {
            type: 'CALL_API',
            method: 'GET',
            status: effect.urls.some((url) => url.includes('{')) ? 'INFERRED' : 'CONFIRMED',
          });
          delete effect.targetRoutes;
        }
      }
  }
  // A non-visual branch belongs to the URL EntryPoint, and forwards to its compatible page.
  for (const screen of screens)
    for (const effect of [...screen.load, ...screen.components.flatMap((c) => c.behaviors)]) {
      if (effect.type !== 'NAVIGATE' || effect.targetScreens?.length !== 0) continue;
      const facts = navigationFacts.get(effect) ?? [],
        ctx = evaluator.transferContext,
        targets = new Map(),
        via = [];
      for (const redirect of entryBranches) {
        if (
          !(effect.targetRoutes ?? []).includes(redirect.route) ||
          redirect.effect.contextWrites?.length
        )
          continue;
        const guard = redirect.effect.contextGuardFacts ?? [];
        if (!guard.length || contradicts([...facts, ...guard])) continue;
        const routes = matchRoute(redirect.effect.urls, patterns).targetRoutes ?? [];
        for (const target of screens.filter((t) => routes.includes(t.route)))
          if (!contradicts([...facts, ...guard, ...ctx.navigationFacts(target.audience)])) {
            const ref = {
              file: target.file,
              route: target.route,
              ...(target.variantKey ? { variantKey: target.variantKey } : {}),
            };
            targets.set(JSON.stringify(ref), ref);
            via.push({
              route: redirect.route,
              source: redirect.effect.source,
              guard: redirect.effect.guard,
            });
          }
      }
      if (targets.size) {
        effect.targetScreens = [...targets.values()];
        effect.entryPointRedirects = via;
        effect.status = 'INFERRED';
        effect.targetConditions = effect.targetScreens.map((ref) => {
          const target = screens.find(
            (s) => s.file === ref.file && s.route === ref.route && s.variantKey === ref.variantKey,
          );
          return { ...ref, ...ctx.explain(screen.audience, target.audience), via };
        });
      }
    }
  for (const screen of screens) {
    if (!screen.redirectOnly) continue;
    const ordered = [
      ...screen.redirects.filter((item) => item.own),
      ...screen.redirects.filter((item) => !item.own),
    ];
    screen.redirectTo = [
      ...new Set(ordered.flatMap((item) => [...(item.effect.targetRoutes ?? [])].sort())),
    ];
  }
  for (const screen of screens) delete screen.redirects;
  let personaResult;
  if (personas !== undefined) {
    const found = personaDimensions(screens, routeRedirects);
    const normalized = normalizePersonas(personas, found.all);
    diagnostics.push(...found.diagnostics, ...normalized.diagnostics);
    applyPersonas(normalized.personas, screens, routeRedirects);
    personaResult = { personaDimensions: found.dimensions, personas: normalized.personas };
  }
  for (const screen of screens) delete screen.queryDefaults;
  const groups = combinations(screens.map((s) => s.audience));
  if (groups.overflow && screens.length)
    diagnostics.push(
      diagnostic(
        screens[0].file,
        screens[0].line,
        'REACT_AUDIENCE_TOO_MANY',
        '身分組合超過 16，僅保留各畫面的條件',
      ),
    );
  const uniqueDiagnostics = new Map();
  for (const item of diagnostics) uniqueDiagnostics.set(JSON.stringify(item), item);
  const result = {
    screens,
    routeRedirects,
    audiences: groups.values,
    diagnostics: [...uniqueDiagnostics.values()].sort(
      (a, b) =>
        a.source.file.localeCompare(b.source.file) ||
        a.source.line - b.source.line ||
        a.code.localeCompare(b.code),
    ),
  };
  if (personaResult) Object.assign(result, personaResult);
  const sheetImports = stylesheets(
    modules,
    shell ? [shell.file] : [...new Set(routes.map((route) => route.file))].sort(),
  );
  result.stylesheets = sheetImports.filter((item) => item.package);
  result.localStylesheets = sheetImports.filter((item) => !item.package);
  return result;
}

export { PARSER } from './modules.mjs';
