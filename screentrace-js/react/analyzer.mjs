import {parseModules, diagnostic, children, line, text, FUNCTIONS, PARSER} from './modules.mjs';
import {Evaluator, unwrap, truthy, externalName, returnedExpressions, conditionText} from './values.mjs';
import {element as htmlElement, htmlAttribute, isAllowedTag, jsxText, serialize, styleText, SAMPLE_TEXT} from './markup.mjs';
import {atoms, unique, combinations, implied, residualGuard, contradicts, simplify} from './audience.mjs';
import {resolveRouteFacts} from './route-conditions.mjs';
import {contextTransfers} from './context-transfer.mjs';
import {stylesheets} from './styles.mjs';

const ROUTER = new Set(['react-router-dom', 'react-router', 'react-router-native']);
const REACT = new Set(['react', 'preact/compat']);
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const ROUTER_FACTORIES = new Set(['createBrowserRouter', 'createHashRouter', 'createMemoryRouter', 'useRoutes']);
const DOM = new Set(['react-dom', 'react-dom/client']);
const LOCATION_OWNERS = new Set(['window', 'globalThis', 'document', 'self']);
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const PASS_THROUGH = new Set(['Fragment', 'StrictMode', 'Suspense', 'Profiler']);
const MAX_LABEL = 80;
const MAX_UNROLLED = 50;
const MAX_GUARD = 300;

/**
 * Static React analysis: routes, the component tree each route renders, interactive elements and what
 * their handlers do. Target code is parsed, never run; values that cannot be proven stay unresolved.
 */
export function analyzeReact({files = [], maxDepth = 24, markup = false} = {}) {
  const {modules, diagnostics} = parseModules(files);
  const evaluator = new Evaluator(modules, maxDepth);
  evaluator.transferContext = contextTransfers(modules,evaluator);
  evaluator.expandAudience=(node,scope)=>expandScalarCondition(node,scope,evaluator);
  const occurrences = jsxOccurrences(modules);
  const routes = findRoutes(modules, evaluator, diagnostics);
  const shell = findRootRender(modules, evaluator);
  const screens = [], routeRedirects = [], entryBranches=[], seen = new Map();
  for (const route of routes) {
    const duplicate = seen.get(route.path);
    if (duplicate) {
      diagnostics.push(diagnostic(route.file, route.line, 'REACT_DUPLICATE_ROUTE', `路由 ${route.path} 重複宣告；沿用 ${duplicate.file}:${duplicate.line}`));
      continue;
    }
    seen.set(route.path, route);
    const base = new ScreenRenderer(evaluator, occurrences, diagnostics, maxDepth, false).render(route, shell);
    const variants = base.variantDecision ?? [null];
    entryBranches.push(...base.load.filter(e=>e.redirect).map(effect=>({route:route.path,effect})));
    routeRedirects.push(...base.load.filter(e => e.routeRedirect).map(effect => ({route: route.path, file: route.file, effect})));
    for (const variant of variants) {
      const initial = new ScreenRenderer(evaluator, occurrences, diagnostics, maxDepth, false, variant?.facts ?? (base.redirectOnly ? [] : base.audienceOriginal)).render(route, shell);
      const screen = new ScreenRenderer(evaluator, occurrences, diagnostics, maxDepth, markup, base.redirectOnly ? [] : initial.audienceOriginal).render(route, shell);
      if (variant) screen.variantKey = JSON.stringify(unique(variant.facts).map(a => [a.text,a.truth]));
      const present = new Set(screen.components.map(c => c.key));
      screen.excluded = base.components.filter(c => !present.has(c.key)).map(component => ({...component, source:{file:component.file,line:component.line}, audience:screen.audience, reason:'此身分下不顯示'}));
      screen.audienceSummary = simplify(screen.audience);
      delete screen.variantDecision;
      screens.push(screen);
    }
  }
  const navigationFacts=new WeakMap();
  const patterns = screens.map(screen => ({route: screen.route, pattern: routePattern(screen.route)}));
  for (const screen of [...screens, {load:routeRedirects.map(r=>r.effect),components:[]}]) {
    for (const effect of [...screen.load, ...screen.components.flatMap(component => component.behaviors)])
      if (effect.type === 'NAVIGATE') {
        const before = effect.status;
        Object.assign(effect, matchRoute(effect.urls, effect.fullPage ? patterns.filter(item => !item.route.includes('*')) : patterns));
        if (before === 'INFERRED' && effect.status === 'CONFIRMED') effect.status = 'INFERRED';
        const blocked=effect.contextWrites??[],ctx=evaluator.transferContext;
        const facts=[...ctx.navigationFacts(screen.audience??[],blocked),...(effect.contextGuardFacts??[]).filter(a=>!blocked.some(id=>a.text.includes('$context'+id.split('#')[1]+'_'))),...(effect.contextIdentity?effect.destinationFacts??[]:[])];
        navigationFacts.set(effect,facts);
        const candidates=screens.filter(s=>(effect.targetRoutes??[]).includes(s.route));
        // Preserve the historical projection for graphs without any Context identity evidence.
        if(candidates.length&&facts.length){
          effect.excludedTargets=[];
          effect.targetScreens=candidates.filter(target=>{const targetFacts=ctx.navigationFacts(target.audience);if(!targetFacts.length||!contradicts([...facts,...targetFacts]))return true;effect.excludedTargets.push({file:target.file,route:target.route,...(target.variantKey?{variantKey:target.variantKey}:{}),reason:'同一 Context 值的來源與目的身分條件矛盾',sourceFacts:facts,targetFacts});return false;}).map(s=>({file:s.file,route:s.route,...(s.variantKey?{variantKey:s.variantKey}:{})}));
        }
        if(effect.excludedTargets?.length)effect.status='INFERRED';
        if(effect.contextIdentity&&!effect.targetScreens)effect.targetScreens=candidates.filter(s=>!contradicts([...(effect.destinationFacts??[]),...ctx.targetFacts(s.audience)])).map(s=>({file:s.file,route:s.route,...(s.variantKey?{variantKey:s.variantKey}:{})}));
        effect.targetConditions=(effect.targetScreens??candidates).map(candidate=>{const target=candidates.find(s=>s.file===candidate.file&&s.route===candidate.route&&s.variantKey===candidate.variantKey);if(!ctx.navigationFacts(screen.audience??[]).length&&!ctx.navigationFacts(target?.audience??[]).length&&!effect.contextIdentity)return null;return {file:candidate.file,route:candidate.route,...(candidate.variantKey?{variantKey:candidate.variantKey}:{}),...ctx.explain(blocked.length?[]:screen.audience??[],target?.audience??[])};}).filter(Boolean);
        // A full-page load of a server URL that is not a client route reaches the backend: treat it as a GET request.
        if (effect.fullPage && effect.status === 'UNRESOLVED' && effect.urls.length && effect.urls.every(url => url.startsWith('/'))) {
          Object.assign(effect, {type: 'CALL_API', method: 'GET', status: effect.urls.some(url => url.includes('{')) ? 'INFERRED' : 'CONFIRMED'});
          delete effect.targetRoutes;
        }
      }
  }
  // A non-visual branch belongs to the URL EntryPoint, and forwards to its compatible page.
  for(const screen of screens)for(const effect of [...screen.load,...screen.components.flatMap(c=>c.behaviors)]){
    if(effect.type!=='NAVIGATE'||effect.targetScreens?.length!==0)continue;
    const facts=navigationFacts.get(effect)??[],ctx=evaluator.transferContext,targets=new Map(),via=[];
    for(const redirect of entryBranches){
      if(!(effect.targetRoutes??[]).includes(redirect.route)||redirect.effect.contextWrites?.length)continue;
      const guard=redirect.effect.contextGuardFacts??[];if(!guard.length||contradicts([...facts,...guard]))continue;
      const routes=matchRoute(redirect.effect.urls,patterns).targetRoutes??[];
      for(const target of screens.filter(t=>routes.includes(t.route)))if(!contradicts([...facts,...guard,...ctx.navigationFacts(target.audience)])){
        const ref={file:target.file,route:target.route,...(target.variantKey?{variantKey:target.variantKey}:{})};targets.set(JSON.stringify(ref),ref);via.push({route:redirect.route,source:redirect.effect.source,guard:redirect.effect.guard});
      }
    }
    if(targets.size){effect.targetScreens=[...targets.values()];effect.entryPointRedirects=via;effect.status='INFERRED';effect.targetConditions=effect.targetScreens.map(ref=>{const target=screens.find(s=>s.file===ref.file&&s.route===ref.route&&s.variantKey===ref.variantKey);return {...ref,...ctx.explain(screen.audience,target.audience),via};});}
  }
  for (const screen of screens) {
    if (!screen.redirectOnly) continue;
    const ordered = [...screen.redirects.filter(item => item.own), ...screen.redirects.filter(item => !item.own)];
    screen.redirectTo = [...new Set(ordered.flatMap(item => [...(item.effect.targetRoutes ?? [])].sort()))];
  }
  for (const screen of screens) delete screen.redirects;
  const groups = combinations(screens.map(s => s.audience));
  if (groups.overflow && screens.length) diagnostics.push(diagnostic(screens[0].file, screens[0].line, 'REACT_AUDIENCE_TOO_MANY', '身分組合超過 16，僅保留各畫面的條件'));
  const uniqueDiagnostics = new Map();
  for (const item of diagnostics) uniqueDiagnostics.set(JSON.stringify(item), item);
  const result = {screens, routeRedirects, audiences: groups.values, diagnostics: [...uniqueDiagnostics.values()].sort((a, b) => a.source.file.localeCompare(b.source.file) || a.source.line - b.source.line || a.code.localeCompare(b.code))};
  if (markup) result.stylesheets = stylesheets(modules, shell ? [shell.file] : [...new Set(routes.map(route => route.file))].sort());
  return result;
}

/** Per JSX element: a stable key (file, name, same-name occurrence) and a readable anchor (file:line, #n when a line holds several). */
function jsxOccurrences(modules) {
  const keys = new Map(), anchors = new Map();
  for (const module of modules.values()) {
    const counts = new Map(), lines = new Map();
    const elements = [];
    const visit = node => {
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
      const at = line(node), ordinal = (ordinals.get(at) ?? 0) + 1;
      ordinals.set(at, ordinal);
      anchors.set(node, `${module.file}:${at}${lines.get(at) > 1 ? '#' + ordinal : ''}`);
    }
  }
  return {keys, anchors};
}

function jsxName(name) {
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') return jsxName(name.object) + '.' + name.property.name;
  if (name.type === 'JSXNamespacedName') return name.namespace.name + ':' + name.name.name;
  return '?';
}

function attribute(element, name) {
  return element.openingElement.attributes.find(item => item.type === 'JSXAttribute' && jsxName(item.name) === name) ?? null;
}

/** The expression an attribute carries: `x="a"` is a literal, a bare `x` is `true`. */
function attributeExpression(item) {
  if (!item) return null;
  if (!item.value) return {type: 'BooleanLiteral', value: true};
  if (item.value.type === 'JSXExpressionContainer') return item.value.expression.type === 'JSXEmptyExpression' ? null : item.value.expression;
  return item.value;
}

function isRouter(value, name) {
  return value.t === 'external' && ROUTER.has(value.specifier) && externalName(value) === name;
}

function isReact(value, name) {
  return value.t === 'external' && REACT.has(value.specifier) && (externalName(value) === name || externalName(value) === 'React.' + name);
}

/** Route declarations from `<Route>` trees and router object arrays, with the layouts that wrap them. */
function findRoutes(modules, evaluator, diagnostics) {
  const routes = [];
  for (const module of modules.values()) {
    const scopes = [evaluator.moduleScope(module.file)];
    let routesElement = null;
    const visit = (node, insideRoute) => {
      if (FUNCTIONS.has(node.type)) {
        scopes.push(evaluator.functionScope(node, scopes.at(-1), []));
        for (const child of children(node)) visit(child, insideRoute);
        scopes.pop();
        return;
      }
      const scope = scopes.at(-1);
      if (node.type === 'JSXElement' && !insideRoute && isRouter(elementValue(evaluator, node, scope), 'Routes')) {
        const previous = routesElement;
        routesElement = node;
        for (const child of children(node)) visit(child, insideRoute);
        routesElement = previous;
        return;
      }
      if (node.type === 'JSXElement' && !insideRoute && isRouter(elementValue(evaluator, node, scope), 'Route')) {
        const before = routes.length;
        collectJsxRoute(node, scope, '', [], module, evaluator, routes);
        for (const route of routes.slice(before)) route.routesElement = routesElement;
        return;
      }
      if (node.type === 'CallExpression' && ROUTER_FACTORIES.has(routerFactory(evaluator, node, scope)) && node.arguments[0]) {
        const array = evaluator.evaluate(node.arguments[0], scope);
        if (array.t === 'array') collectObjectRoutes(array, '', [], module, evaluator, routes, diagnostics);
        else diagnostics.push(diagnostic(module.file, line(node), 'REACT_ROUTES_UNRESOLVED', '路由設定不是可靜態判定的陣列'));
      }
      for (const child of children(node)) visit(child, insideRoute);
    };
    visit(module.ast.program, false);
  }
  return routes;
}

/** The JSX passed to `createRoot(...).render()`, `hydrateRoot()` or legacy `ReactDOM.render()`. */
function findRootRender(modules, evaluator) {
  for (const module of [...modules.values()].sort((a, b) => a.file.localeCompare(b.file))) {
    const scope = evaluator.moduleScope(module.file);
    let found = null;
    const visit = node => {
      if (found || !node?.type) return;
      if (node.type === 'CallExpression') {
        const callee = unwrap(node.callee);
        if (callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 'render' && node.arguments[0]) {
          const owner = unwrap(callee.object);
          const root = owner.type === 'CallExpression' ? evaluator.evaluate(owner.callee, scope) : evaluator.evaluate(owner, scope);
          const viaRoot = owner.type === 'CallExpression' && root.t === 'external' && DOM.has(root.specifier) && externalName(root) === 'createRoot';
          const legacy = root.t === 'external' && DOM.has(root.specifier) && root.path.length === 0;
          const rootVariable = owner.type === 'Identifier' && isCreateRoot(evaluator, owner.name, scope);
          if (viaRoot || legacy || rootVariable) { found = {expr: node.arguments[0], scope, file: module.file}; return; }
        }
        const value = evaluator.evaluate(callee, scope);
        if (value.t === 'external' && DOM.has(value.specifier) && ['render', 'hydrate', 'hydrateRoot'].includes(externalName(value))) {
          const element = externalName(value) === 'hydrateRoot' ? node.arguments[1] : node.arguments[0];
          if (element) { found = {expr: element, scope, file: module.file}; return; }
        }
      }
      for (const child of children(node)) visit(child);
    };
    visit(module.ast.program);
    if (found) return found;
  }
  return null;
}

function isCreateRoot(evaluator, name, scope) {
  const found = evaluator.lookup(name, scope);
  const init = found?.entry?.kind === 'variable' ? unwrap(found.entry.node.init) : null;
  if (init?.type !== 'CallExpression') return false;
  const callee = evaluator.evaluate(init.callee, found.scope);
  return callee.t === 'external' && DOM.has(callee.specifier) && externalName(callee) === 'createRoot';
}

function routerFactory(evaluator, node, scope) {
  const callee = evaluator.evaluate(node.callee, scope);
  return callee.t === 'external' && ROUTER.has(callee.specifier) ? externalName(callee) : null;
}

function elementValue(evaluator, element, scope) {
  const name = element.openingElement.name;
  if (name.type === 'JSXIdentifier') return /^[a-z]/.test(name.name) ? {t: 'intrinsic', name: name.name} : evaluator.resolveName(name.name, scope);
  if (name.type === 'JSXMemberExpression') return evaluator.property(elementValue(evaluator, {openingElement: {name: name.object}}, scope), name.property.name);
  return {t: 'intrinsic', name: jsxName(name)};
}

function joinRoute(parent, child) {
  if (child === undefined || child === null) return parent || '/';
  if (child.startsWith('/')) return child.replace(/\/{2,}/g, '/');
  return ((parent.endsWith('/') ? parent : parent + '/') + child).replace(/\/{2,}/g, '/');
}

function collectJsxRoute(element, scope, parent, layouts, module, evaluator, routes) {
  const pathValue = attribute(element, 'path') ? evaluator.evaluate(attributeExpression(attribute(element, 'path')), scope) : null;
  const index = attribute(element, 'index') !== null;
  const path = pathValue?.t === 'lit' ? joinRoute(parent, String(pathValue.v)) : index || !attribute(element, 'path') ? parent || '/' : null;
  const rendered = routeElement(attribute(element, 'element'), attribute(element, 'Component') ?? attribute(element, 'component'), scope);
  const nested = element.children.filter(child => child.type === 'JSXElement' && isRouter(elementValue(evaluator, child, scope), 'Route'));
  if (path === null) return;
  if (rendered && (!nested.length || index)) routes.push({path, file: module.file, line: line(element), element: rendered, layouts});
  else if (rendered && nested.length && !nested.some(child => attribute(child, 'index'))) routes.push({path, file: module.file, line: line(element), element: rendered, layouts, layoutOnly: true});
  const nextLayouts = rendered ? [...layouts, rendered] : layouts;
  for (const child of nested) collectJsxRoute(child, scope, path, nextLayouts, module, evaluator, routes);
}

function routeElement(elementAttribute, componentAttribute, scope) {
  const expr = attributeExpression(elementAttribute);
  if (expr) return {expr, scope};
  const component = attributeExpression(componentAttribute);
  return component ? {component, scope} : null;
}

function collectObjectRoutes(array, parent, layouts, module, evaluator, routes, diagnostics) {
  for (const item of array.node.elements) {
    const route = item && evaluator.evaluate(item, array.scope);
    if (route?.t !== 'object') {
      if (item) diagnostics.push(diagnostic(module.file, line(item), 'REACT_ROUTES_UNRESOLVED', '路由項目不是可靜態判定的物件'));
      continue;
    }
    const property = name => route.node.properties.find(p => p.type === 'ObjectProperty' && !p.computed && (p.key.name ?? p.key.value) === name)?.value;
    const pathValue = property('path') ? evaluator.evaluate(property('path'), route.scope) : null;
    const index = evaluator.evaluate(property('index') ?? {type: 'BooleanLiteral', value: false}, route.scope);
    const path = pathValue?.t === 'lit' ? joinRoute(parent, String(pathValue.v)) : parent || '/';
    const rendered = property('element') ? {expr: property('element'), scope: route.scope} : property('Component') ? {component: property('Component'), scope: route.scope} : null;
    const nested = property('children') ? evaluator.evaluate(property('children'), route.scope) : null;
    const routeLine = line(route.node);
    if (rendered && (nested?.t !== 'array' || (index.t === 'lit' && index.v))) routes.push({path, file: route.scope.module.file, line: routeLine, element: rendered, layouts});
    if (nested?.t === 'array') collectObjectRoutes(nested, path, rendered ? [...layouts, rendered] : layouts, module, evaluator, routes, diagnostics);
  }
}

/** Converts `/service/:id/edit` into a matcher that also accepts `{id}` placeholders from static URLs. */
function routePattern(route) {
  const parts = route.split('/').filter(Boolean).map(part => part === '*' ? '.*' : part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp('^/' + parts.join('/') + '/?$');
}

function matchRoute(urls, patterns) {
  const targets = new Set();
  let inferred = false;
  for (const url of urls ?? []) {
    const exact = patterns.filter(item => item.route === url);
    const found = exact.length ? exact : patterns.filter(item => item.pattern.test(url) && !item.route.includes('*'));
    const fallback = found.length ? found : patterns.filter(item => item.pattern.test(url));
    if (!exact.length || url.includes('{')) inferred = true;
    for (const item of fallback) targets.add(item.route);
  }
  const targetRoutes = [...targets].sort();
  return {targetRoutes, status: targetRoutes.length === 0 ? 'UNRESOLVED' : targetRoutes.length > 1 ? 'AMBIGUOUS' : inferred ? 'INFERRED' : 'CONFIRMED'};
}

class ScreenRenderer {
  constructor(evaluator, occurrences, diagnostics, maxDepth, markup = false, audience = []) {
    this.evaluator = evaluator;
    this.occurrences = occurrences.keys;
    this.anchorsOf = occurrences.anchors;
    this.markup = markup;
    this.document = htmlElement(null);
    this.diagnostics = diagnostics;
    this.maxDepth = maxDepth;
    this.sources = new Set();
    this.components = new Map();
    this.load = [];
    this.loaded = new Set();
    this.view = null;
    this.audience = audience;
    this.facts = audience;
    this.variantDecision = null;
    this.inRoute = 0;
    this.routeContent = 0;
    this.emitted = new Set();
  }

  render(route, shell = null) {
    this.evaluator.routePath=/[:*]/.test(route.path)?null:route.path;
    this.facts=resolveRouteFacts(this.audience,this.evaluator);
    this.routesElement = route.routesElement ?? null;
    this.reachedRoutes = false;
    this.routePath = route.path;
    this.routeElements = [...route.layouts, route.element].map(entry => entry.expr ?? entry.component);
    const outlets = [...route.layouts, route.element];
    const root = outlets.shift();
    const state = {guards: [], anchors: [], keys: [], stack: [], depth: 0, repeated: false, form: null, outlets, out: this.document};
    this.sources.add(route.file);
    this.routeFile = route.file;
    if (shell && this.routesElement) {
      this.sources.add(shell.file);
      this.pendingRoute = {root, state};
      this.expr(shell.expr, shell.scope, {...state, outlets: []});
    }
    if (!this.reachedRoutes) this.renderRoute(root, state);
    const components = [...this.components.values()];
    const excludedBehaviors = [];
    const visible = effect => {
      if (!contradicts([...this.facts, ...(effect.pruningFacts??atoms(effect.guard, effect.source))])) return true;
      excludedBehaviors.push({...effect, reason:'此身分下不顯示', audience:this.audience}); return false;
    };
    components.forEach(component => { component.behaviors = dedupe(component.behaviors).filter(visible); component.guard = residualGuard(component.guard, resolveRouteFacts(this.audience,this.evaluator)); });
    this.load = this.load.filter(visible);
    this.load.forEach(effect => { effect.guard = residualGuard(effect.guard, resolveRouteFacts(this.audience,this.evaluator)); });
    return {
      excludedBehaviors,
      variantDecision: this.variantDecision,
      audience: resolveRouteFacts(this.audience,this.evaluator),
      audienceOriginal: unique(this.audience),
      route: route.path, file: route.file, line: route.line, layoutOnly: Boolean(route.layoutOnly),
      view: this.view?.name ?? 'Route', viewSource: this.view?.file ?? route.file,
      // A route that renders nothing of its own and only redirects is a forwarding address, not a page.
      redirectOnly: this.routeContent === 0 && this.load.some(effect => effect.routeRedirect),
      // Redirects written in the screen's own component come first; a guard's "not signed in" redirect after.
      redirects: this.load.filter(effect => effect.routeRedirect).map(effect => ({effect, own: !!this.view && effect.source.file === this.view.file && effect.source.line >= this.view.from && effect.source.line <= this.view.to})),
      sources: [...this.sources].sort(), components: components.sort((a, b) => a.key.localeCompare(b.key)), load: dedupe(this.load),
      ...(this.markup ? {markup: serialize(closeConditionalDialogs(this.document))} : {})
    };
  }

  /** Renders the route's own elements; the shell around `<Routes>` is not part of the route. */
  renderRoute(entry, state) {
    if (!entry) return;
    this.inRoute++;
    try {
      if (entry.expr) { this.expr(entry.expr, entry.scope, state); return; }
      const value = this.evaluator.evaluate(entry.component, entry.scope);
      if (value.t === 'fn') this.component(value, {t: 'props', attrs: new Map(), children: null}, entry.component, state, entry.scope.module.file);
    } finally { this.inRoute--; }
  }

  expr(input, scope, state) {
    if (contradicts([...this.facts, ...state.guards.flatMap(g => atoms(g, {file:scope.module.file,line:line(input)}))])) return;
    const node = unwrap(input);
    if (!node) return;
    switch (node.type) {
      case 'JSXElement': this.element(node, scope, state); return;
      case 'JSXFragment': this.childNodes(node.children, scope, state); return;
      case 'JSXExpressionContainer': this.expr(node.expression, scope, state); return;
      case 'StringLiteral': case 'NumericLiteral': case 'TemplateLiteral': case 'BinaryExpression': this.text(node, scope, state); return;
      case 'ArrayExpression': node.elements.forEach(item => item && this.expr(item.type === 'SpreadElement' ? item.argument : item, scope, state)); return;
      case 'ConditionalExpression': {
        const truth = this.condition(node.test, scope);
        const test = text(scope.module, node.test);
        if (truth === null) {
          this.either(out => this.expr(node.consequent, scope, {...guarded(state, test), out}), out => this.expr(node.alternate, scope, {...guarded(state, `!(${test})`), out}), state);
          return;
        }
        this.expr(truth ? node.consequent : node.alternate, scope, state);
        return;
      }
      case 'LogicalExpression': {
        const truth = this.condition(node.left, scope);
        if (node.operator === '&&') { if (truth !== false) this.expr(node.right, scope, truth ? state : guarded(state, text(scope.module, node.left))); return; }
        if (!(truth === null && textual(node.right))) this.expr(node.left, scope, state);
        if (truth !== true) this.expr(node.right, scope, guarded(state, `!(${text(scope.module, node.left)})`));
        return;
      }
      case 'ArrowFunctionExpression': case 'FunctionExpression': this.body({t: 'fn', node, scope}, [], state, false); return;
      case 'CallExpression': case 'OptionalCallExpression': this.callExpr(node, scope, state); return;
      case 'Identifier': case 'MemberExpression': case 'OptionalMemberExpression': this.reference(node, scope, state); return;
      default:
    }
  }

  condition(node, scope) {
    const known = truthy(this.evaluator.evaluate(node, scope));
    if(known!==null)return known;const expression=this.evaluator.expandAudience(node,scope)??text(scope.module,node);return implied(this.facts,expression);
  }

  reference(node, scope, state) {
    if (state.stack.includes(node)) return;
    const value = this.evaluator.evaluate(node, scope);
    const next = {...state, stack: [...state.stack, node]};
    if (value.t === 'jsx') this.expr(value.node, value.scope, next);
    else if (value.t === 'children') this.childNodes(value.closure.nodes, value.closure.scope, {...next, anchors: value.closure.anchors, keys: value.closure.keys, form: value.closure.form ?? state.form});
    else if (value.t === 'array') this.expr(value.node, value.scope, next);
    else if (value.t === 'lit' && (typeof value.v === 'string' || typeof value.v === 'number')) this.emitText(String(value.v), state);
    else if (value.t === 'unknown') {
      const before = state.out.children.length;
      if (node.type === 'Identifier') this.renderVariable(node, scope, next);
      if (state.out.children.length === before) this.emitText(SAMPLE_TEXT, state);
    }
  }

  /** Text for a string-valued expression; parts that cannot be proven show the shared sample value. */
  text(node, scope, state) {
    const value = this.evaluator.strings(node, scope)[0] ?? '';
    this.emitText(value.replace(/\{[^{}]*\}/g, SAMPLE_TEXT), state);
  }

  emitText(value, state) {
    if (this.markup && value) state.out.children.push(value);
  }

  anchor(node, file) {
    return this.anchorsOf.get(node) ?? `${file}:${line(node)}`;
  }

  /** JSX held in a variable whose value is conditional, e.g. `const body = page === 'a' ? <A/> : <B/>`. */
  renderVariable(node, scope, state) {
    const found = this.evaluator.lookup(node.name, scope);
    if (found?.entry?.kind === 'variable' && found.entry.node.init && !(found.entry.steps ?? []).length) this.expr(found.entry.node.init, found.scope, state);
    else if (found?.binding?.expr) this.expr(found.binding.expr, found.binding.scope, state);
  }

  callExpr(node, scope, state) {
    const callee = node.callee;
    const method = callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression' ? callee.property.name : null;
    if (['map', 'flatMap', 'forEach'].includes(method)) {
      const fn = this.evaluator.evaluate(node.arguments[0], scope);
      if (fn.t !== 'fn') return;
      const items = this.evaluator.evaluate(callee.object, scope);
      const elements = items.t === 'array' ? items.node.elements : null;
      if (elements && elements.length <= MAX_UNROLLED && elements.every(item => item && item.type !== 'SpreadElement')) {
        elements.forEach((item, index) => this.body(fn, [{expr: item, scope: items.scope}, {value: {t: 'lit', v: index}}], {...state, keys: [...state.keys, `[${index}]`], anchors: [...state.anchors, `[${index}]`]}, false));
        return;
      }
      this.body(fn, [], {...state, repeated: true}, false);
      return;
    }
    const value = this.evaluator.evaluate(callee, scope);
    if (value.t === 'children') {
      const closure = value.closure, args = node.arguments.map(expr => ({expr, scope}));
      for (const child of closure.nodes) {
        const fn = child.type === 'JSXExpressionContainer' ? unwrap(child.expression) : null;
        if (fn && (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression'))
          this.body({t: 'fn', node: fn, scope: closure.scope}, args, {...state, anchors: closure.anchors, keys: closure.keys, form: closure.form ?? state.form}, false);
      }
      return;
    }
    if (value.t === 'fn' && !state.stack.includes(value.node) && state.depth < this.maxDepth) {
      this.body(value, node.arguments.map(expr => ({expr, scope})), {...state, stack: [...state.stack, value.node], depth: state.depth + 1}, false);
      return;
    }
    const markupArguments = node.arguments.filter(arg => ['JSXElement', 'JSXFragment'].includes(unwrap(arg)?.type));
    markupArguments.forEach(arg => this.expr(arg, scope, state));
    if (!markupArguments.length) this.emitText(SAMPLE_TEXT, state);
  }

  childNodes(nodes, scope, state) {
    for (const child of nodes ?? []) {
      if (child.type === 'JSXText') this.emitText(jsxText(child.value), state);
      else this.expr(child, scope, state);
    }
  }

  element(node, scope, state) {
    const value = elementValue(this.evaluator, node, scope);
    const module = scope.module, key = this.occurrences.get(node) ?? `${module.file}#?#${line(node)}`;
    if (value.t === 'intrinsic') { this.intrinsic(node, value.name, scope, state, key); return; }
    if (value.t === 'external' && ROUTER.has(value.specifier)) { this.routerElement(node, externalName(value), scope, state, key); return; }
    if (value.t === 'external' && REACT.has(value.specifier) && PASS_THROUGH.has(externalName(value).replace(/^React\./, ''))) { this.childNodes(node.children, scope, state); return; }
    if (value.t === 'fn') {
      const props = this.props(node, scope, state);
      this.component(value, props, node, state, module.file, key);
      return;
    }
    if (value.t === 'external') {
      // A UI library component rendered as a router link (reactstrap tag={Link}, react-bootstrap as={Link},
      // MUI component={Link}) navigates exactly like <Link to=…>.
      const routerLink = this.polymorphicRouterLink(node, scope);
      if (routerLink) { this.routerElement(node, routerLink, scope, state, key); return; }
      const handlers = this.handlers(node, scope, state);
      if (handlers.length) this.record(node, scope, state, key, {kind: 'OTHER', tag: jsxName(node.openingElement.name), handlers});
      this.childNodes(node.children, scope, state);
      return;
    }
    const name = jsxName(node.openingElement.name);
    if (/\.(Provider|Consumer)$/.test(name)) {
      for (const child of node.children) {
        const fn = child.type === 'JSXExpressionContainer' ? unwrap(child.expression) : null;
        if (fn && (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression')) this.body({t: 'fn', node: fn, scope}, [], state, false);
        else if (child.type !== 'JSXText') this.expr(child, scope, state);
      }
      return;
    }
    this.diagnostics.push(diagnostic(module.file, line(node), 'REACT_COMPONENT_UNRESOLVED', `無法靜態解析元件 <${jsxName(node.openingElement.name)}>；只分析其子元素`));
    this.childNodes(node.children, scope, state);
  }

  props(node, scope, state) {
    const attrs = new Map();
    let spread = false;
    for (const item of node.openingElement.attributes) {
      if (item.type === 'JSXSpreadAttribute') { spread = true; continue; }
      const expr = attributeExpression(item);
      if (expr) attrs.set(jsxName(item.name), {expr, scope});
    }
    const content = node.children.filter(child => child.type !== 'JSXText' || child.value.trim());
    const children = content.length ? {nodes: content, scope, anchors: state.anchors, keys: state.keys, form: state.form} : attrs.has('children') ? null : null;
    return {t: 'props', attrs, children, spread};
  }

  component(fn, props, node, state, file, key = null) {
    if (state.stack.includes(fn.node)) {
      this.diagnostics.push(diagnostic(file, line(node), 'REACT_RENDER_CYCLE', `元件 ${fn.name ?? '(匿名)'} 遞迴渲染；停止展開`));
      return;
    }
    if (state.depth >= this.maxDepth) {
      this.diagnostics.push(diagnostic(file, line(node), 'REACT_RENDER_DEPTH', `元件展開超過 ${this.maxDepth} 層；停止展開 ${fn.name ?? '(匿名)'}`));
      return;
    }
    // The screen is named after the innermost component written in the route element, never a shell provider.
    if (this.inRoute && this.routeElements.some(expr => expr && node.start >= expr.start && node.end <= expr.end && file === this.routeFile))
      this.view = {name: fn.name ?? 'Route', file: fn.scope.module.file, from: fn.node.loc?.start.line ?? 0, to: fn.node.loc?.end.line ?? 0};
    this.sources.add(fn.scope.module.file);
    const next = {...state, depth: state.depth + 1, stack: [...state.stack, fn.node], anchors: [...state.anchors, this.anchor(node, file)], keys: key ? [...state.keys, key] : state.keys};
    this.body(fn, [{value: props}], next, true);
  }

  /** Renders what a function returns; component bodies also contribute their page-load effects. */
  body(fn, args, state, isComponent) {
    const scope = this.evaluator.functionScope(fn.node, fn.scope, args, state.depth);
    if (isComponent && this.inRoute && state.routeCandidate !== false && !this.variantDecision) {
      const branches = returnBranches(fn.node.body, scope, this.evaluator);
      const pages = branches.map(b => ({...b, identity: branchIdentity(b.expr, scope, this.evaluator)})).filter(b => b.identity);
      if (new Set(pages.map(b => b.identity)).size > 1) this.variantDecision = pages.map(b => ({facts: this.evaluator.transferContext.remember(b.path.flatMap(item => atoms(item.expression, {file:scope.module.file,line:line(item.node)})),scope)}));
    }
    if (isComponent) this.audience = unique([...this.audience, ...this.evaluator.transferContext.remember(wrapperFacts(fn.node.body, scope, this.evaluator),scope)]);
    if (isComponent) this.loadEffects(fn.node.body, scope, state, new Set([fn.node]));
    if (fn.node.body.type !== 'BlockStatement') { this.expr(fn.node.body, scope, state); return; }
    this.statements(fn.node.body.body, scope, state);
  }

  statements(list, scope, state) {
    for (let index = 0; index < list.length; index++) {
      const statement = list[index];
      if (statement.type === 'IfStatement' && !statement.alternate && alwaysReturns(statement.consequent) && this.condition(statement.test, scope) === null) {
        // `if (x) return <A/>; …rest` — both are recorded; the preview prefers the rest, the resting state.
        const test = text(scope.module, statement.test), rest = list.slice(index + 1);
        let restReturns = false;
        this.either(out => this.statement(statement.consequent, scope, {...guarded(state, test), out}), out => { restReturns = this.statements(rest, scope, {...guarded(state, `!(${test})`), out}); }, state);
        return restReturns;
      }
      if (this.statement(statement, scope, state)) return true;
    }
    return false;
  }

  /**
   * Renders two alternatives that cannot be told apart statically. Both contribute components and effects;
   * the preview keeps the second (the `else`/fall-through, usually the resting state) unless it is empty.
   */
  either(first, second, state) {
    if (!this.markup) { first(state.out); second(state.out); return; }
    const base = new Set(this.emitted);
    const run = render => {
      this.emitted = new Set(base);
      const out = htmlElement(null);
      render(out);
      return {out, emitted: this.emitted};
    };
    const a = run(first), b = run(second);
    const chosen = hasContent(b.out) ? b : a;
    this.emitted = chosen.emitted;
    state.out.children.push(...chosen.out.children);
  }

  /** Returns true when the statement always returns, so later statements cannot render. */
  statement(node, scope, state) {
    switch (node?.type) {
      case 'ReturnStatement': this.expr(node.argument, scope, state); return true;
      case 'BlockStatement': return this.statements(node.body, scope, state);
      case 'IfStatement': {
        const truth = this.condition(node.test, scope);
        const test = text(scope.module, node.test);
        if (truth === true) return this.statement(node.consequent, scope, state);
        if (truth === false) return node.alternate ? this.statement(node.alternate, scope, state) : false;
        let left = false, right = false;
        this.either(out => { left = this.statement(node.consequent, scope, {...guarded(state, test), out}); },
          out => { right = node.alternate ? this.statement(node.alternate, scope, {...guarded(state, `!(${test})`), out}) : false; }, state);
        return left && right;
      }
      case 'SwitchStatement': {
        const discriminant = this.evaluator.evaluate(node.discriminant, scope);
        let start = -1;
        if (discriminant.t === 'lit') {
          start = node.cases.findIndex(item => item.test && this.evaluator.evaluate(item.test, scope).v === discriminant.v && this.evaluator.evaluate(item.test, scope).t === 'lit');
          if (start < 0) start = node.cases.findIndex(item => !item.test);
          if (start >= 0) {
            for (const item of node.cases.slice(start)) {
              if (this.statements(item.consequent, scope, state)) return true;
              if (item.consequent.some(s => s.type === 'BreakStatement')) return false;
            }
            return false;
          }
        }
        for (const item of node.cases) this.statements(item.consequent, scope, guarded(state, item.test ? `${text(scope.module, node.discriminant)} === ${text(scope.module, item.test)}` : `default`));
        return false;
      }
      case 'TryStatement': this.statement(node.block, scope, state); if (node.handler) this.statement(node.handler.body, scope, state); return false;
      default: return false;
    }
  }

  routerElement(node, name, scope, state, key) {
    if (name === 'Outlet') {
      const [next, ...rest] = state.outlets;
      if (next) this.renderRoute(next, {...state, outlets: rest});
      return;
    }
    if (name === 'Link' || name === 'NavLink') {
      if (this.inRoute) this.routeContent++;
      const to = attributeExpression(attribute(node, 'to'));
      const click=attributeExpression(attribute(node,'onClick')),contextWrites=click?[...this.evaluator.transferContext.writes(click,scope)]:[];
      const choices=to?this.destinationChoices(to,scope,state):null;
      const urls = choices?cleanUrls(choices.flatMap(c=>c.urls)):to ? this.urlsOf(to, scope) : [];
      const behaviors = choices?choices.map(candidate=>this.effect('NAVIGATE','click',node,scope,{...unguarded(state),guards:candidate.conditions},{...candidate,contextWrites,expression:text(scope.module,to)})):[this.effect('NAVIGATE', 'click', node, scope, unguarded(state), {urls, contextWrites,expression: text(scope.module, to)})];
      behaviors.push(...this.handlers(node, scope, state).flatMap(handler => handler.effects));
      const component = this.record(node, scope, state, key, {kind: 'LINK', tag: name, target: urls[0] ?? null, handlers: [], behaviors});
      const out = this.output(node, 'a', scope, state, key);
      if (out.tag) {
        out.attributes['data-st-expansion-anchor'] = component.anchor;
        if (urls[0]) out.attributes.href = urls[0];
      }
      this.childNodes(node.children, scope, {...state, out});
      return;
    }
    if (name === 'Navigate') {
      const to = attributeExpression(attribute(node, 'to'));
      const destinations = to ? this.destinationChoices(to, scope, state) : null;
      for (const candidate of destinations ?? [{urls:to?this.urlsOf(to,scope):[],conditions:[],trace:[]}])
        this.addLoad(this.effect('NAVIGATE','load',node,scope,{...state,guards:[...state.guards,...candidate.conditions]}, {...candidate,source:{file:scope.module.file,line:line(node)},expression:text(scope.module,node),redirect:true,routeRedirect:this.inRoute>0}));
      return;
    }
    if (name === 'Routes' && node === this.routesElement && this.pendingRoute && !this.reachedRoutes) {
      this.reachedRoutes = true;
      const {root, state: routeState} = this.pendingRoute;
      this.renderRoute(root, {...routeState, guards: state.guards, anchors: state.anchors, keys: state.keys, stack: state.stack, depth: state.depth});
      return;
    }
    if (name === 'Routes' || name === 'Route') {
      if (node === this.routesElement) return;
      this.diagnostics.push(diagnostic(scope.module.file, line(node), 'REACT_NESTED_ROUTES', '元件內的巢狀 <Routes> 未展開為獨立畫面'));
      return;
    }
    this.childNodes(node.children, scope, state);
  }

  polymorphicRouterLink(node, scope) {
    for (const name of ['tag', 'as', 'component']) {
      const expr = attributeExpression(attribute(node, name));
      if (!expr) continue;
      const value = this.evaluator.evaluate(expr, scope);
      if (value.t === 'external' && ROUTER.has(value.specifier) && ['Link', 'NavLink'].includes(externalName(value))) return externalName(value);
    }
    return null;
  }

  destinationChoices(expr,scope,state) {
    const result = destinationCandidates(expr,scope,this.evaluator,this.maxDepth);
    if (!result.handled) {const transfer=this.evaluator.transferContext(state.guards.flatMap(g=>atoms(g,{file:scope.module.file,line:line(expr)})),scope);if(!transfer.proofs.length)return null;return [{urls:this.urlsOf(expr,scope),conditions:[],destinationFacts:transfer.facts,contextIdentity:transfer.proofs.length>0,trace:transfer.proofs.map(source=>({callee:'Context state/return identity',source}))}];}
    if (result.limited) this.diagnostics.push(diagnostic(scope.module.file,line(expr),'REACT_DESTINATION_LIMIT','目的地分支超過安全展開限制，保留未解析候選'));
    return result.items.filter(item=>!contradicts([...this.facts,...state.guards.flatMap(g=>atoms(g,{file:scope.module.file,line:line(expr)})),...(result.conditionsProvable?item.conditions:[]).flatMap(g=>atoms(g,item.source))])).map(item=>{const transfer=this.evaluator.transferContext([...state.guards,...(result.conditionsProvable?item.conditions:[])].flatMap(g=>atoms(g,item.source)),scope);return {...item,...(!result.conditionsProvable?{pruningFacts:state.guards.flatMap(g=>atoms(g,item.source))}:{}),urls:cleanUrls(item.urls),destinationFacts:transfer.facts,contextIdentity:transfer.proofs.length>0,trace:[...item.trace,...transfer.proofs.map(source=>({callee:'Context state/return identity',source}))]};});
  }

  urlsOf(expr, scope) {
    const value = this.evaluator.evaluate(expr, scope);
    if (value.t === 'object') {
      const pathname = value.node.properties.find(p => p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === 'pathname');
      return pathname ? cleanUrls(this.evaluator.strings(pathname.value, value.scope)) : [];
    }
    if (value.t === 'lit' && typeof value.v === 'number') return [];
    return cleanUrls(this.evaluator.strings(expr, scope));
  }

  intrinsic(node, tag, scope, state, key) {
    if (this.inRoute) this.routeContent++;
    const attrs = this.staticAttributes(node, scope);
    const handlers = this.handlers(node, scope, state);
    const kind = intrinsicKind(tag, attrs, state.form !== null, handlers.length > 0);
    const out = this.output(node, tag, scope, state, key);
    let next = {...state, out, routeCandidate:false};
    if (kind) {
      const component = this.record(node, scope, state, key, {kind, tag, attrs, handlers, target: tag === 'a' ? attrs.href ?? null : null});
      if (out.tag) out.attributes['data-st-expansion-anchor'] = component.anchor;
      if (tag === 'a' && attrs.href && !attrs.href.startsWith('#')) component.behaviors.push(this.effect('NAVIGATE', 'click', node, scope, unguarded(state), {urls: cleanUrls([attrs.href]), expression: attrs.href, fullPage:true}));
      if (kind === 'FORM') next = {...next, form: component};
      if (kind === 'SUBMIT' && state.form) {
        component.form = state.form.key;
        component.behaviors.push(...state.form.submitEffects.map(effect => ({...effect, event: 'click', viaForm: true})));
        state.form.submitters.push(component);
      }
    }
    this.childNodes(node.children, scope, next);
    if (kind === 'FORM' && next.form.submitters.length) next.form.behaviors = next.form.behaviors.filter(effect => effect.event !== 'submit' || effect.type === 'VALIDATE');
  }

  /**
   * The HTML element for one rendered JSX element. An element already emitted on another render path
   * (a wrapper returning `children` from two branches) gets a detached node so the preview shows it once.
   */
  output(node, tag, scope, state, key) {
    const instanceKey = [...state.keys, key].join(' > ');
    if (!this.markup || !isAllowedTag(tag) || this.emitted.has(instanceKey)) return htmlElement(null);
    this.emitted.add(instanceKey);
    const attributes = {'data-st-source-file': scope.module.file, 'data-st-source-line': String(line(node))};
    for (const item of node.openingElement.attributes) {
      if (item.type !== 'JSXAttribute') continue;
      const name = jsxName(item.name), expr = attributeExpression(item);
      if (!expr || name === 'to') continue;
      let value;
      if (name === 'style') value = this.styleOf(expr, scope);
      else if (name === 'className' || name === 'class') value = this.classOf(expr, scope);
      else {
        const evaluated = this.evaluator.evaluate(expr, scope);
        value = evaluated.t === 'lit' ? evaluated.v : undefined;
      }
      const html = htmlAttribute(name, value);
      if (html && !html[0].startsWith('data-st-')) attributes[html[0]] = html[1];
    }
    const element = htmlElement(tag, attributes);
    element.guards = state.guards;
    state.out.children.push(element);
    return element;
  }

  styleOf(expr, scope) {
    const value = this.evaluator.evaluate(expr, scope);
    if (value.t === 'lit' && typeof value.v === 'string') return value.v;
    if (value.t !== 'object') return undefined;
    const entries = [];
    for (const property of value.node.properties) {
      if (property.type !== 'ObjectProperty' || property.computed) continue;
      const item = this.evaluator.evaluate(property.value, value.scope);
      if (item.t === 'lit' && ['string', 'number'].includes(typeof item.v)) entries.push([property.key.name ?? String(property.key.value), item.v]);
    }
    return styleText(entries) || undefined;
  }

  /** The resting class list: the shortest fully proven alternative, otherwise the proven parts only. */
  classOf(expr, scope) {
    const options = this.evaluator.strings(expr, scope);
    const proven = options.filter(item => !item.includes('{')).sort((a, b) => a.length - b.length || a.localeCompare(b));
    const chosen = proven[0] ?? options[0]?.replace(/\{[^{}]*\}/g, ' ') ?? '';
    return chosen.split(/\s+/).filter(Boolean).join(' ') || undefined;
  }

  staticAttributes(node, scope) {
    const attrs = {};
    for (const item of node.openingElement.attributes) {
      if (item.type !== 'JSXAttribute') continue;
      const name = jsxName(item.name);
      if (!['type', 'name', 'id', 'href', 'role', 'className', 'placeholder', 'title', 'aria-label', 'value', 'multiple', 'action', 'method', 'required', 'alt', 'htmlFor', 'disabled'].includes(name)) continue;
      const expr = attributeExpression(item);
      const value = expr ? this.evaluator.evaluate(expr, scope) : null;
      if (value?.t === 'lit' && value.v !== undefined && value.v !== null && value.v !== false) attrs[name] = String(value.v);
      else if (value && name === 'href') attrs[name] = cleanUrls(this.evaluator.strings(expr, scope))[0] ?? text(scope.module, expr);
      else if (value && LABEL_ATTRIBUTES.has(name)) { const options = literalAlternatives(this.evaluator, expr, scope); if (options) attrs[name] = options; }
    }
    return attrs;
  }

  handlers(node, scope, state) {
    const result = [];
    for (const item of node.openingElement.attributes) {
      if (item.type !== 'JSXAttribute') continue;
      const name = jsxName(item.name);
      if (!/^on[A-Z]/.test(name)) continue;
      const expr = attributeExpression(item);
      if (!expr) continue;
      const event = name.slice(2).toLowerCase();
      const value = this.evaluator.evaluate(expr, scope);
      if (value.t !== 'fn') {
        if (value.t === 'unknown') result.push({event, expression: text(scope.module, expr), effects: [this.effect('UNKNOWN', event, expr, scope, unguarded(state), {expression: text(scope.module, expr), status: 'UNRESOLVED'})]});
        continue;
      }
      const effects = new EffectRunner(this, event, unguarded(state)).run(value, value.node.params.map(()=>({value:{t:'unknown'}})), new Set());
      result.push({event, expression: text(scope.module, expr), effects});
    }
    return result;
  }

  record(node, scope, state, key, {kind, tag, attrs = {}, handlers = [], target = null, behaviors = []}) {
    const instanceKey = [...state.keys, key].join(' > ');
    const existing = this.components.get(instanceKey);
    if (existing) {
      existing.guard = mergeGuards(existing.guard, joinGuards(state.guards));
      return existing;
    }
    const label = labelOf(node, attrs, this.evaluator, scope, kind);
    const submitEffects = kind === 'FORM' ? handlers.filter(h => h.event === 'submit').flatMap(h => h.effects) : [];
    const component = {
      key: instanceKey, file: scope.module.file, line: line(node), anchor: [...state.anchors, this.anchor(node, scope.module.file)].join(' > '),
      kind, tag, label: label.text, labelSource: label.source, attrs, target, guard: joinGuards(state.guards),
      repeated: state.repeated, form: null, behaviors: [...behaviors, ...handlers.flatMap(handler => handler.effects)], submitEffects, submitters: []
    };
    this.components.set(instanceKey, component);
    return component;
  }

  addLoad(effect) {
    const key = JSON.stringify([effect.type, effect.urls, effect.method, effect.source, ...(effect.type === 'NAVIGATE' ? [effect.guard] : [])]);
    if (this.loaded.has(key)) return;
    this.loaded.add(key);
    this.load.push(effect);
  }

  effect(type, event, node, scope, state, extra = {}) {
    return {type, event, source: {file: scope.module.file, line: line(node)}, contextGuardFacts:this.evaluator.transferContext.effectFacts(state.guards??[],scope,{file:scope.module.file,line:line(node)}),guard: joinGuards(state.guards ?? []), trace: [], expression: text(scope.module, node), status: 'CONFIRMED', ...extra};
  }

  /** Effects that run while the screen renders: `useEffect` bodies, also inside custom hooks. */
  loadEffects(body, scope, state, seen) {
    const visit = (node, guards) => {
      if (!node?.type || FUNCTIONS.has(node.type)) return;
      if (node.type === 'IfStatement') {
        visit(node.test, guards);
        const known=truthy(this.evaluator.evaluate(node.test,scope));if(known!==null){visit(known?node.consequent:node.alternate,guards);return;}
        visit(node.consequent, [...guards, text(scope.module, node.test)]);
        visit(node.alternate, [...guards, `!(${text(scope.module, node.test)})`]);
        return;
      }
      if (node.type === 'CallExpression') {
        const callee = this.evaluator.evaluate(node.callee, scope);
        if (callee.t === 'external' && REACT.has(callee.specifier) && EFFECT_HOOKS.has(externalName(callee).replace(/^React\./, ''))) {
          const fn = node.arguments[0] && this.evaluator.evaluate(node.arguments[0], scope);
          if (fn?.t === 'fn') for (const effect of new EffectRunner(this, 'load', {...state, guards: [...state.guards, ...guards]}).run(fn, [], new Set())) this.addLoad(effect);
          return;
        }
        if (callee.t === 'fn' && /^use[A-Z0-9]/.test(callee.name ?? '') && !seen.has(callee.node) && state.depth < this.maxDepth) {
          const inner = this.evaluator.functionScope(callee.node, callee.scope, node.arguments.map(expr => ({expr, scope})), state.depth + 1);
          this.sources.add(callee.scope.module.file);
          this.loadEffects(callee.node.body, inner, {...state, depth: state.depth + 1, guards: [...state.guards, ...guards]}, new Set([...seen, callee.node]));
        }
      }
      for (const child of children(node)) visit(child, guards);
    };
    visit(body, []);
  }
}

/** Follows a handler through local, imported and prop-supplied functions to the requests and navigation it performs. */
class EffectRunner {
  constructor(renderer, event, state) {
    this.renderer = renderer;
    this.evaluator = renderer.evaluator;
    this.event = event;
    this.state = state;
    this.effects = [];
    this.contextWrites=new Set();
  }

  run(fn, args, active, trace = [], guards = []) {
    if (active.has(fn.node) || trace.length >= this.renderer.maxDepth) return this.effects;
    const scope = this.evaluator.functionScope(fn.node, fn.scope, args, this.state.depth);
    const next = new Set([...active, fn.node]);
    this.walk(fn.node.body, scope, next, trace, guards);
    return this.effects;
  }

  walk(node, scope, active, trace, guards) {
    if (!node?.type || FUNCTIONS.has(node.type) || node.type === 'ClassBody') return;
    const module = scope.module;
    switch (node.type) {
      case 'IfStatement': case 'ConditionalExpression': {
        this.walk(node.test, scope, active, trace, guards);
        const known=truthy(this.evaluator.evaluate(node.test,scope));if(known!==null){this.walk(known?node.consequent:node.alternate,scope,active,trace,guards);return;}
        const test = text(module, node.test);
        const previous=new Set(this.contextWrites);
        this.walk(node.consequent, scope, active, trace, [...guards, test]);const left=new Set(this.contextWrites);
        this.contextWrites=new Set(previous);this.walk(node.alternate, scope, active, trace, [...guards, `!(${test})`]);
        this.contextWrites=new Set([...left,...this.contextWrites]);
        return;
      }
      case 'LogicalExpression': {
        this.walk(node.left, scope, active, trace, guards);
        const value=this.evaluator.evaluate(node.left,scope),known=truthy(value);if(node.operator==='&&'&&known===false||node.operator==='||'&&known===true||node.operator==='??'&&value.t==='lit'&&value.v!=null)return;
        const left = text(module, node.left);
        this.walk(node.right, scope, active, trace, [...guards, node.operator === '&&' ? left : `!(${left})`]);
        return;
      }
      case 'BlockStatement': {
        // After `if (x) return;` the rest of the block only runs when `x` is false.
        let current = guards;
        for (const statement of node.body) {
          this.walk(statement, scope, active, trace, current);
          if(['ReturnStatement','ThrowStatement'].includes(statement.type))break;
          if(statement.type==='IfStatement'){const known=truthy(this.evaluator.evaluate(statement.test,scope));if(known!==null&&alwaysReturns(known?statement.consequent:statement.alternate))break;}
          if (statement.type === 'IfStatement' && !statement.alternate && alwaysReturns(statement.consequent)) current = [...current, `!(${text(module, statement.test)})`];
        }
        return;
      }
      case 'ForInStatement': {
        const object=this.evaluator.evaluate(node.right,scope),id=node.left.type==='VariableDeclaration'?node.left.declarations[0]?.id:node.left;
        if(object.t==='object'&&id?.type==='Identifier'){const inner={...scope,bindings:new Map([[id.name,{value:{t:'dispatch-key',object,complete:!hasEarlyExit(node.body)}}]]),locals:new Map(),parent:scope};this.walk(node.body,inner,active,trace,guards);return;}break;
      }
      case 'CallExpression': case 'OptionalCallExpression': case 'NewExpression':
        this.call(node, scope, active, trace, guards);
        return;
      case 'AssignmentExpression':
        if (isLocation(node.left, this.evaluator, scope, true)) this.fullPage(node, node.right, scope, guards, trace);
        this.walk(node.right, scope, active, trace, guards);
        return;
      default:
        for (const child of children(node)) this.walk(child, scope, active, trace, guards);
    }
  }

  call(node, scope, active, trace, guards) {
    const callee = unwrap(node.callee);
    const value = node.type === 'NewExpression' ? {t: 'unknown'} : this.evaluator.evaluate(callee, scope);
    const where = {...this.state, guards: [...this.state.guards, ...guards]};
    if(this.dispatch(node,callee,scope,active,trace,guards))return;
    if(['MemberExpression','OptionalMemberExpression'].includes(callee.type)&&!callee.computed&&['map','forEach'].includes(callee.property.name)){
      const keys=this.evaluator.evaluate(callee.object,scope),callback=node.arguments[0]&&this.evaluator.evaluate(node.arguments[0],scope);
      if(keys.t==='object-keys'&&callback?.t==='fn'){this.run(callback,[{value:{t:'dispatch-key',object:keys.object,complete:!hasEarlyExit(callback.node.body)}}],active,trace,guards);return;}
    }
    for(const id of this.evaluator.transferContext.writes(callee,scope))this.contextWrites.add(id);
    for(const argument of node.arguments)for(const id of this.evaluator.transferContext.writesIn(argument,scope))this.contextWrites.add(id);
    const extra = {trace,contextWrites:[...this.contextWrites]};
    if (callee.type === 'Identifier' && callee.name === 'fetch' && !this.evaluator.lookup('fetch', scope)) {
      if (!this.pairedRequest(node, node.arguments[0], node.arguments[1], scope, where, extra))
        this.request(node, node.arguments[0], this.methodOf(node.arguments[1], scope), scope, where, extra);
    } else if (value.t === 'external' && value.specifier === 'axios') {
      const name = value.path.at(-1);
      if (value.path.length === 0 || name === 'request') {
        const config = node.arguments[0] && this.evaluator.evaluate(node.arguments[0], scope);
        const url = config?.t === 'object' ? config.node.properties.find(p => p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === 'url')?.value : null;
        this.request(node, url ?? null, config ? this.methodOf(node.arguments[0], scope) : 'GET', url ? config.scope : scope, where, extra);
      } else if (HTTP_METHODS.has(name)) this.request(node, node.arguments[0], name.toUpperCase(), scope, where, extra);
    } else if ((callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') && !callee.computed && ['assign', 'replace'].includes(callee.property.name) && isLocation(callee.object, this.evaluator, scope, false)) {
      if (node.arguments[0]) this.fullPage(node, node.arguments[0], scope, guards, trace);
    } else if (value.t === 'navigate') {
      const target = node.arguments[0];
      const candidates = target ? this.renderer.destinationChoices(target,scope,where) : null;
      if (candidates) {
        for (const candidate of candidates) this.effects.push(this.renderer.effect('NAVIGATE',this.event,node,scope,{...where,guards:[...where.guards,...candidate.conditions]}, {...candidate,contextWrites:[...this.contextWrites],source:{file:scope.module.file,line:line(node)},trace:[...trace,...candidate.trace],expression:text(scope.module,node)}));
      } else if (target && !(this.evaluator.evaluate(target, scope).t === 'lit' && typeof this.evaluator.evaluate(target, scope).v === 'number'))
        this.effects.push(this.renderer.effect('NAVIGATE', this.event, node, scope, where, {...extra, urls:this.renderer.urlsOf(target,scope), expression: text(scope.module, node)}));
    } else if (value.t === 'fn' && !active.has(value.node)) {
      const step = {callee: text(scope.module, callee).slice(0, 120), source: {file: scope.module.file, line: line(node)}};
      this.run(value, node.arguments.map(expr => ({expr, scope})), active, [...trace, step], guards);
    }
    if (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') this.walk(callee.object, scope, active, trace, guards);
    for (const argument of node.arguments) {
      const arg = unwrap(argument);
      if (arg && (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression')) this.run({t: 'fn', node: arg, scope}, arg.params.map(()=>({value:{t:'unknown'}})), active, trace, guards);
      else this.walk(arg, scope, active, trace, guards);
    }
  }

  dispatch(node,callee,scope,active,trace,guards){
    if(!['MemberExpression','OptionalMemberExpression'].includes(callee.type)||!callee.computed)return false;
    const object=this.evaluator.evaluate(callee.object,scope);if(object.t!=='object')return false;
    const properties=object.node.properties;
    if(properties.length>20){this.renderer.diagnostics.push(diagnostic(scope.module.file,line(node),'REACT_DISPATCH_TABLE_TOO_LARGE','分派表超過 20 個屬性，保留未解析呼叫'));return true;}
    if(properties.some(p=>!['ObjectProperty','ObjectMethod'].includes(p.type)||p.kind&&p.kind!=='method'))return true;
    const names=[];for(const p of properties){const key=p.computed?this.evaluator.evaluate(p.key,object.scope):{t:'lit',v:p.key.name??p.key.value};if(key.t!=='lit')return true;names.push(String(key.v));}
    const key=this.evaluator.evaluate(callee.property,scope),fixed=key.t==='lit'&&key.v!==undefined,iteration=key.t==='dispatch-key'&&key.object.node===object.node&&key.object.scope===object.scope&&key.complete;
    const selected=fixed?[String(key.v)]:[...new Set(names)].sort(),inferred=!fixed&&!iteration;
    const step={callee:text(scope.module,callee),dispatch:fixed?'分派表，key 常值':iteration?'分派表，全部 key 迭代':'分派表，key 未定',source:{file:scope.module.file,line:line(node)}};
    const start=this.effects.length;
    for(const name of selected){const fn=this.evaluator.property(object,name);if(fn.t==='fn')this.run(fn,node.arguments.map(expr=>({expr,scope})),active,[...trace,step],guards);}
    if(inferred)for(const effect of this.effects.slice(start))if(effect.status==='CONFIRMED')effect.status='INFERRED';
    for(const arg of node.arguments)this.walk(arg,scope,active,trace,guards);
    return true;
  }

  fullPage(node, target, scope, guards, trace) {
    const where = {...this.state, guards: [...this.state.guards, ...guards]};
    this.effects.push(this.renderer.effect('NAVIGATE', this.event, node, scope, where, {trace, contextWrites:[...this.contextWrites], urls: cleanUrls(this.evaluator.strings(target, scope)), expression: text(scope.module, node).slice(0, 400), fullPage: true}));
  }

  methodOf(options, scope) {
    if (!options) return 'GET';
    const value = this.evaluator.property(this.evaluator.evaluate(options, scope), 'method');
    if (value.t === 'lit') return value.v === undefined || value.v === null ? 'GET' : String(value.v).toUpperCase();
    return null;
  }

  request(node, urlExpr, method, scope, where, extra) {
    const candidates = urlExpr ? this.evaluator.strings(urlExpr, scope) : [];
    // A relative URL resolves against the page, which for a routed screen is its route: api/x from /groups is /api/x.
    const relative = candidates.filter(isRelativeUrl);
    const urls = cleanUrls(candidates.map(candidate => isRelativeUrl(candidate) ? resolveAgainstRoute(candidate, this.renderer.routePath) ?? candidate : candidate));
    const status = urls.length === 0 || method === null ? 'UNRESOLVED' : relative.length || urls.some(url => url.includes('{')) ? 'INFERRED' : 'CONFIRMED';
    this.effects.push(this.renderer.effect('CALL_API', this.event, node, scope, where, {...extra, urls, method, status, ...(relative.length ? {relativeUrls: relative} : {}), expression: text(scope.module, node).slice(0, 400)}));
  }

  /**
   * fetch(`/api/group${group.id ? `/${group.id}` : ''}`, {method: group.id ? 'PUT' : 'POST'}): when the method is a
   * ternary whose test also chooses part of the URL, each branch is one request under that branch's guard.
   */
  pairedRequest(node, urlExpr, options, scope, where, extra) {
    if (!urlExpr || !options) return false;
    const config = this.evaluator.evaluate(options, scope);
    const property = config.t === 'object' ? config.node.properties.find(p => p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === 'method') : null;
    const choice = property ? unwrap(property.value) : null;
    if (choice?.type !== 'ConditionalExpression') return false;
    const test = conditionText(config.scope.module, choice.test);
    if (!conditionsIn(urlExpr).some(item => conditionText(scope.module, item.test) === test)) return false;
    const testText = text(config.scope.module, choice.test);
    for (const [outcome, branch, guard] of [[true, choice.consequent, testText], [false, choice.alternate, `!(${testText})`]]) {
      const value = this.evaluator.evaluate(branch, config.scope);
      const method = value.t === 'lit' && value.v !== undefined && value.v !== null ? String(value.v).toUpperCase() : null;
      this.evaluator.assumptions = new Map([[test, outcome]]);
      try { this.request(node, urlExpr, method, scope, {...where, guards: [...where.guards, guard]}, extra); }
      finally { this.evaluator.assumptions = null; }
    }
    return true;
  }
}

/** `location`, `window.location` and friends; with `href`, also the `.href` property of either. */
function isLocation(node, evaluator, scope, allowHref) {
  let target = unwrap(node);
  if (allowHref && (target?.type === 'MemberExpression') && !target.computed && target.property.name === 'href') target = unwrap(target.object);
  if (target?.type === 'Identifier') return target.name === 'location' && !evaluator.lookup('location', scope);
  if (target?.type !== 'MemberExpression' || target.computed || target.property.name !== 'location') return false;
  const owner = unwrap(target.object);
  return owner.type === 'Identifier' && LOCATION_OWNERS.has(owner.name) && !evaluator.lookup(owner.name, scope);
}

function isDialog(node) {
  const attributes = node.attributes;
  return node.tag === 'dialog' || attributes['aria-modal'] === 'true' || /^(dialog|alertdialog)$/.test(attributes.role ?? '')
    || /(^|\s)(modal|offcanvas)(\s|$)/.test(attributes.class ?? '');
}

/**
 * A dialog that renders only under a condition starts closed, as on first load. The whole conditional
 * block around it is hidden — its fixed layer, its backdrop and siblings rendered under the same condition —
 * not just the element marked as the dialog. Its components stay in the graph.
 */
function closeConditionalDialogs(document) {
  const visit = (node, ancestors) => {
    if (typeof node === 'string') return;
    if (node.tag && node.guards?.length && isDialog(node)) {
      const key = JSON.stringify(node.guards);
      let root = node, parent = ancestors.at(-1), index = ancestors.length - 1;
      while (parent?.tag && JSON.stringify(parent.guards) === key) { root = parent; parent = ancestors[--index]; }
      for (const sibling of parent?.children ?? [root]) {
        if (typeof sibling === 'string' || !sibling.tag || JSON.stringify(sibling.guards) !== key) continue;
        if (!/display:none!important/.test(sibling.attributes.style ?? '')) sibling.attributes.style = [sibling.attributes.style, 'display:none!important'].filter(Boolean).join(';');
        sibling.attributes['data-st-condition'] = key;
      }
      return;
    }
    for (const child of node.children) visit(child, [...ancestors, node]);
  };
  visit(document, []);
  return document;
}

function hasContent(node) {
  return node.children.some(child => typeof child === 'string' ? child.trim() : true);
}

function textual(node) {
  const n = unwrap(node);
  return ['StringLiteral', 'TemplateLiteral', 'NumericLiteral', 'BinaryExpression'].includes(n?.type);
}

/**
 * What a click does is conditioned only by the handler itself; the conditions under which the element is
 * shown at all belong to the component (its `guard`), not to each of its behaviors.
 */
function unguarded(state) {
  return {...state, guards: []};
}

function guarded(state, guard) {
  return {...state, guards: [...state.guards, guard]};
}

/** Keeps only URLs a request or navigation could use: absolute paths or http(s) URLs, without query or fragment. */
function isRelativeUrl(candidate) {
  const value = candidate.split(/[?#]/)[0];
  return value !== '' && !value.startsWith('/') && !value.startsWith('{') && !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

/** Resolves a relative request URL the way the browser does from the route's page; null for a non-literal route. */
function resolveAgainstRoute(candidate, route) {
  if (typeof route !== 'string' || !route.startsWith('/') || route.includes('*')) return null;
  try {
    const resolved = new URL(candidate, 'http://screentrace.invalid' + route);
    return resolved.origin === 'http://screentrace.invalid' ? decodeURI(resolved.pathname) + resolved.search : null;
  } catch { return null; }
}

/** Every ConditionalExpression inside a URL expression (template literal parts and + operands). */
function conditionsIn(expr) {
  const node = unwrap(expr);
  if (!node) return [];
  if (node.type === 'ConditionalExpression') return [node, ...conditionsIn(node.consequent), ...conditionsIn(node.alternate)];
  if (node.type === 'TemplateLiteral') return node.expressions.flatMap(conditionsIn);
  if (node.type === 'BinaryExpression' && node.operator === '+') return [...conditionsIn(node.left), ...conditionsIn(node.right)];
  return [];
}

function cleanUrls(candidates) {
  const urls = new Set();
  for (const candidate of candidates) {
    const value = candidate.split(/[?#]/)[0];
    if (/^https?:\/\//i.test(value)) urls.add(value);
    else if (value.startsWith('/')) urls.add(value.length > 1 ? value.replace(/\/+$/, '') || '/' : value);
  }
  return [...urls].sort();
}

function intrinsicKind(tag, attrs, insideForm, interactive) {
  const type = (attrs.type ?? '').toLowerCase();
  switch (tag) {
    case 'a': return attrs.href || interactive ? 'LINK' : null;
    case 'button': return type === 'submit' || (!type && insideForm) ? 'SUBMIT' : 'BUTTON';
    case 'input':
      if (type === 'hidden') return null;
      if (type === 'submit' || type === 'image') return 'SUBMIT';
      if (type === 'button' || type === 'reset') return 'BUTTON';
      if (type === 'checkbox') return 'CHECKBOX';
      if (type === 'radio') return 'RADIO';
      if (['date', 'datetime-local', 'time', 'month', 'week'].includes(type)) return 'DATE_PICKER';
      if (type === 'file') return 'FILE_INPUT';
      return 'TEXT_INPUT';
    case 'select': return attrs.multiple ? 'MULTI_SELECT' : 'SELECT';
    case 'textarea': return 'TEXTAREA';
    case 'form': return 'FORM';
    case 'dialog': return 'MODAL';
    case 'table': return 'TABLE';
    default:
      if (attrs.role === 'dialog' || attrs.role === 'alertdialog' || /(^|\s)modal(\s|$)/.test(attrs.className ?? '')) return 'MODAL';
      if (attrs.role === 'button') return 'BUTTON';
      return interactive ? 'OTHER' : null;
  }
}

function labelOf(node, attrs, evaluator, scope, kind) {
  if (kind === 'FORM' || kind === 'TABLE') {
    for (const name of ['aria-label', 'title', 'name', 'id']) if (attrs[name]) return {text: attrs[name].slice(0, MAX_LABEL), source: name};
    return {text: null, source: null};
  }
  const visible = visibleText(node.children, evaluator, scope, 0).replace(/\s+/g, ' ').trim();
  if (visible) return {text: visible.slice(0, MAX_LABEL), source: 'visibleText'};
  for (const name of ['aria-label', 'title', 'placeholder', 'value', 'alt', 'name', 'id']) if (attrs[name]) return {text: attrs[name].slice(0, MAX_LABEL), source: name};
  return {text: null, source: null};
}

function visibleText(nodes, evaluator, scope, depth) {
  if (depth > 4) return '';
  let out = '';
  for (const child of nodes ?? []) {
    if (child.type === 'JSXText') out += ' ' + child.value;
    else if (child.type === 'JSXExpressionContainer') out += ' ' + expressionText(child.expression, evaluator, scope, depth).join(' / ');
    else if (child.type === 'JSXElement' || child.type === 'JSXFragment') out += ' ' + visibleText(child.children, evaluator, scope, depth + 1);
  }
  return out;
}

/** Text alternatives an expression child can show; parts that cannot be proven contribute nothing. */
function expressionText(expr, evaluator, scope, depth) {
  const node = unwrap(expr);
  if (!node || depth > 4) return [];
  if (node.type === 'ConditionalExpression') return distinctText([...expressionText(node.consequent, evaluator, scope, depth + 1), ...expressionText(node.alternate, evaluator, scope, depth + 1)]);
  if (node.type === 'LogicalExpression') return expressionText(node.right, evaluator, scope, depth + 1);
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') return distinctText([visibleText(node.type === 'JSXElement' ? node.children : node.children, evaluator, scope, depth + 1)]);
  const value = evaluator.evaluate(node, scope);
  if (value.t === 'lit' && (typeof value.v === 'string' || typeof value.v === 'number')) return [String(value.v)];
  if (value.t === 'children') return distinctText([visibleText(value.closure.nodes, evaluator, value.closure.scope, depth + 1)]);
  if (value.t === 'jsx') return expressionText(value.node, evaluator, value.scope, depth + 1);
  const options = literalAlternatives(evaluator, node, scope);
  return options ? [options] : [];
}

function distinctText(items) {
  return [...new Set(items.map(item => item.replace(/\s+/g, ' ').trim()).filter(Boolean))];
}

const LABEL_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'value', 'alt']);

/** `{busy ? '登入中…' : '登入'}` reads as `登入中… / 登入`; anything with an unproven part is left out. */
function literalAlternatives(evaluator, expr, scope) {
  const node = unwrap(expr);
  if (!node || !['ConditionalExpression', 'LogicalExpression', 'TemplateLiteral', 'Identifier', 'MemberExpression'].includes(node.type)) return null;
  const options = evaluator.strings(node, scope).filter(item => item.trim());
  return options.length && options.every(item => !item.includes('{')) ? options.join(' / ') : null;
}

function alwaysReturns(node) {
  if (!node) return false;
  if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') return true;
  if (node.type === 'BlockStatement') return node.body.some(alwaysReturns);
  if (node.type === 'IfStatement') return alwaysReturns(node.consequent) && alwaysReturns(node.alternate);
  return false;
}

function joinGuards(guards) {
  if (!guards.length) return null;
  return guards.length === 1 ? guards[0] : guards.map(item => /\|\||\?/.test(item) && !/^!\(.*\)$/.test(item) ? `(${item})` : item).join(' && ');
}

function mergeGuards(left, right) {
  if (left === null || right === null) return null;
  if (left === right) return left;
  const merged = `(${left}) || (${right})`;
  return merged.length > MAX_GUARD ? merged.slice(0, MAX_GUARD - 1) + '…' : merged;
}

function dedupe(effects) {
  const result = new Map();
  for (const effect of effects) {
    const key = JSON.stringify([effect.type, effect.event, effect.urls, effect.method, effect.source, effect.guard]);
    if (!result.has(key)) result.set(key, effect);
  }
  return [...result.values()];
}

export {PARSER};

/** Only functions that actually forward their children contribute access constraints. */
function returnBranches(body, scope, evaluator) {
  const result = [];
  function expression(node,path) {
    if(node?.type==='ConditionalExpression') {
      const known=truthy(evaluator.evaluate(node.test,scope)), condition=text(scope.module,node.test);
      if(known!==false)expression(node.consequent,known===true?path:[...path,{expression:condition,node:node.test}]);
      if(known!==true)expression(node.alternate,known===false?path:[...path,{expression:`!(${condition})`,node:node.test}]);
    } else result.push({expr:node,path});
  }
  function statements(list,paths) {
    for(const node of list) {
      if(node.type==='ReturnStatement'){paths.forEach(p=>expression(node.argument,p));return [];}
      if(node.type==='BlockStatement'){paths=statements(node.body,paths);continue;}
      if(node.type==='IfStatement') {
        const known=truthy(evaluator.evaluate(node.test,scope)),condition=text(scope.module,node.test);
        const left=known===false?[]:statements(node.consequent.type==='BlockStatement'?node.consequent.body:[node.consequent],paths.map(p=>known===true?p:[...p,{expression:condition,node:node.test}]));
        const rest=known===true?[]:paths.map(p=>known===false?p:[...p,{expression:`!(${condition})`,node:node.test}]);
        paths=[...left,...(node.alternate?statements(node.alternate.type==='BlockStatement'?node.alternate.body:[node.alternate],rest):rest)];
      }
    }
    return paths;
  }
  if(body.type==='BlockStatement')statements(body.body,[[]]);else expression(body,[]);
  return result;
}
function wrapperFacts(body,scope,evaluator) {
  function carries(node) {
    if(!node)return false;
    if(['Identifier','MemberExpression','OptionalMemberExpression'].includes(node.type)&&evaluator.evaluate(node,scope).t==='children')return true;
    return children(node).some(carries);
  }
  const savedPath=evaluator.routePath;evaluator.routePath=null;
  let raw;try{raw=returnBranches(body,scope,evaluator);}finally{evaluator.routePath=savedPath;}
  const accepted=raw.filter(b=>carries(b.expr)).map(b=>b.path);
  if(!accepted.length||accepted.some(p=>!p.length))return [];
  if(accepted.length===1)return accepted[0].flatMap(item=>atoms(item.expression,{file:scope.module.file,line:line(item.node)}));
  const expression=accepted.map(p=>'('+p.map(i=>'('+i.expression+')').join(' && ')+')').join(' || ');
  return atoms(expression,{file:scope.module.file,line:line(body)}).map(atom=>({...atom,origins:accepted.flatMap(path=>path.map(item=>({file:scope.module.file,line:line(item.node)})))})).filter(a=>implied([],a.truth?a.text:`!(${a.text})`)!==true);
}
function branchIdentity(input,scope,evaluator) {
  let node=unwrap(input);if(!node)return null;
  if(node.type==='Identifier') {const value=evaluator.evaluate(node,scope);if(value.t==='jsx')return branchIdentity(value.node,value.scope,evaluator);}
  if(node.type==='JSXFragment') {const items=node.children.filter(c=>c.type==='JSXElement');return items.length===1?branchIdentity(items[0],scope,evaluator):null;}
  if(node.type!=='JSXElement')return null;
  const value=elementValue(evaluator,node,scope);
  if(value.t!=='fn')return null;
  const nested=node.children.filter(c=>c.type==='JSXElement').map(c=>branchIdentity(c,scope,evaluator)).filter(Boolean);
  return value.scope.module.file+':'+value.node.start+':'+nested.join(',');
}

/** Substitute parameter bindings through AST source ranges; local state remains symbolic. */
function boundText(node,scope,evaluator,seen=new Set()) {
 const source=text(scope.module,node),edits=[];
 function visit(n,parent,key) {
  if(n.type==='Identifier' && !(parent && ((['MemberExpression','OptionalMemberExpression'].includes(parent.type)&&key==='property'&&!parent.computed)||(parent.type==='ObjectProperty'&&key==='key'&&!parent.computed)))) {
    const found=evaluator.lookup(n.name,scope),binding=found?.binding;
    if(binding?.expr && !seen.has(binding)) {const next=new Set([...seen,binding]);const expr=unwrap(binding.expr);const value=expr.type==='CallExpression'&&expr.callee.type==='Identifier'&&expr.callee.name==='Boolean'&&!evaluator.lookup('Boolean',binding.scope)&&expr.arguments.length===1?'!!('+boundText(expr.arguments[0],binding.scope,evaluator,next)+')':boundText(expr,binding.scope,evaluator,next);edits.push({from:n.start-node.start,to:n.end-node.start,value:'('+value+')'});return;}
  }
  for(const [name,value]of Object.entries(n)) {
    if(!value||typeof value!=='object')continue;
    if(Array.isArray(value)){for(const child of value)if(child?.type)visit(child,n,name);}
    else if(value.type)visit(value,n,name);
  }
 }
 visit(node,null,null);let result=source;for(const edit of edits.sort((a,b)=>b.from-a.from))result=result.slice(0,edit.from)+edit.value+result.slice(edit.to);return result;
}
function destinationCandidates(input,scope,evaluator,maxDepth) {
 let handled=false,visits=0,unprovenArguments=false;
 function stableArgument(input){const n=unwrap(input);if(!n)return false;if(['Identifier','StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(n.type))return true;return ['MemberExpression','OptionalMemberExpression'].includes(n.type)&&stableArgument(n.object)&&(!n.computed||['StringLiteral','NumericLiteral'].includes(n.property.type));}
 function resolve(expr,current,conditions=[],trace=[],depth=0,active=new Set()) {
  const node=unwrap(expr),source={file:current.module.file,line:line(node)};
  const unknown=()=>[{urls:[],conditions,trace,source,status:'UNRESOLVED'}];
  if(!node||depth>=maxDepth||++visits>4096)return unknown();
  if(node.type==='MemberExpression'&&!node.computed&&node.property.name==='path')return resolve(node.object,current,conditions,trace,depth+1,active);
  if(node.type==='Identifier') {
    const found=evaluator.lookup(node.name,current);
    if(found?.binding?.expr)return resolve(found.binding.expr,found.binding.scope,conditions,trace,depth+1,active);
    if(found?.entry?.kind==='variable'&&found.entry.node.init&&!(found.entry.steps??[]).length)return resolve(found.entry.node.init,found.scope,conditions,trace,depth+1,active);
  }
  if(node.type==='CallExpression'||node.type==='OptionalCallExpression') {
    const fn=evaluator.evaluate(node.callee,current);
    if(fn.t!=='fn')return unknown();handled=true;
    if(active.has(fn.node))return unknown();
    if(node.arguments.some(arg=>!stableArgument(arg)))unprovenArguments=true;
    const inner=evaluator.functionScope(fn.node,fn.scope,node.arguments.map(expr=>({expr,scope:current})),depth+1),next=new Set([...active,fn.node]);
    const branches=returnBranches(fn.node.body,inner,evaluator);
    return branches.flatMap(branch=>{
      const path=branch.path.map(item=>{const value=boundText(item.node,inner,evaluator);return item.expression===text(inner.module,item.node)?value:`!(${value})`;});
      const step={callee:text(current.module,node.callee),source:{file:inner.module.file,line:line(branch.expr)}};
      return resolve(branch.expr,inner,[...conditions,...path],[...trace,step],depth+1,next);
    });
  }
  if(node.type==='ConditionalExpression') {
    handled=true;
    const condition=boundText(node.test,current,evaluator),known=truthy(evaluator.evaluate(node.test,current));
    return [...(known!==false?resolve(node.consequent,current,known===true?conditions:[...conditions,condition],trace,depth+1,active):[]),...(known!==true?resolve(node.alternate,current,known===false?conditions:[...conditions,`!(${condition})`],trace,depth+1,active):[])];
  }
  if(node.type==='ObjectExpression') {
    const path=node.properties.find(p=>p.type==='ObjectProperty'&&!p.computed&&(p.key.name??p.key.value)==='path');
    return path?resolve(path.value,current,conditions,trace,depth+1,active):unknown();
  }
  const value=evaluator.evaluate(node,current);
  return value.t==='lit'&&typeof value.v==='string'?[{urls:[value.v],conditions,trace,source,status:'INFERRED'}]:unknown();
 }
 const items=resolve(input,scope);return {handled,items,conditionsProvable:!unprovenArguments,limited:visits>4096};
}

/** A pure single-return discriminator is the same branch predicate as its literal result. */
function expandScalarCondition(input,scope,evaluator){
 const node=unwrap(input);if(node?.type!=='BinaryExpression'||!['===','!=='].includes(node.operator)||unwrap(node.left)?.type!=='CallExpression')return null;
 const call=unwrap(node.left),fn=evaluator.evaluate(call.callee,scope),expected=evaluator.evaluate(node.right,scope);
 if(fn.t!=='fn'||expected.t!=='lit')return null;
 function pure(n,current){n=unwrap(n);if(!n)return false;if(n.type==='CallExpression')return n.callee.type==='Identifier'&&n.callee.name==='Boolean'&&!evaluator.lookup('Boolean',current)&&n.arguments.length===1&&pure(n.arguments[0],current);if(['AssignmentExpression','UpdateExpression','AwaitExpression','NewExpression','YieldExpression'].includes(n.type)||FUNCTIONS.has(n.type))return false;return children(n).every(c=>pure(c,current));}
 const body=fn.node.body.type==='BlockStatement'?fn.node.body.body:[];if(body.length!==1||body[0].type!=='ReturnStatement'||!pure(body[0].argument,fn.scope)||!call.arguments.every(a=>pure(a,scope)))return null;
 const inner=evaluator.functionScope(fn.node,fn.scope,call.arguments.map(expr=>({expr,scope}))),branches=returnBranches(fn.node.body,inner,evaluator),paths=[];
 for(const branch of branches){const value=evaluator.evaluate(branch.expr,inner);if(value.t!=='lit')return null;if((value.v===expected.v)!==(node.operator==='==='))continue;
 const path=branch.path.map(item=>{const value=boundText(item.node,inner,evaluator);return item.expression===text(inner.module,item.node)?value:`!(${value})`;});if(!path.length)return 'true';paths.push('('+path.join(' && ')+')');}
 return paths.length?paths.join(' || '):'false';
}

function hasEarlyExit(node){if(!node||FUNCTIONS.has(node.type))return false;return ["BreakStatement","ContinueStatement","ReturnStatement","ThrowStatement"].includes(node.type)||children(node).some(hasEarlyExit);}
