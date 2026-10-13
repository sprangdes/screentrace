import {parseModules, diagnostic, children, line, text, FUNCTIONS, PARSER} from './modules.mjs';
import {Evaluator, unwrap, truthy, externalName, returnedExpressions} from './values.mjs';

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
export function analyzeReact({files = [], maxDepth = 24} = {}) {
  const {modules, diagnostics} = parseModules(files);
  const evaluator = new Evaluator(modules, maxDepth);
  const occurrences = jsxOccurrences(modules);
  const routes = findRoutes(modules, evaluator, diagnostics);
  const shell = findRootRender(modules, evaluator);
  const screens = [], seen = new Map();
  for (const route of routes) {
    const duplicate = seen.get(route.path);
    if (duplicate) {
      diagnostics.push(diagnostic(route.file, route.line, 'REACT_DUPLICATE_ROUTE', `路由 ${route.path} 重複宣告；沿用 ${duplicate.file}:${duplicate.line}`));
      continue;
    }
    seen.set(route.path, route);
    screens.push(new ScreenRenderer(evaluator, occurrences, diagnostics, maxDepth).render(route, shell));
  }
  const patterns = screens.map(screen => ({route: screen.route, pattern: routePattern(screen.route)}));
  for (const screen of screens) {
    for (const effect of [...screen.load, ...screen.components.flatMap(component => component.behaviors)])
      if (effect.type === 'NAVIGATE') {
        Object.assign(effect, matchRoute(effect.urls, effect.fullPage ? patterns.filter(item => !item.route.includes('*')) : patterns));
        // A full-page load of a server URL that is not a client route reaches the backend: treat it as a GET request.
        if (effect.fullPage && effect.status === 'UNRESOLVED' && effect.urls.length && effect.urls.every(url => url.startsWith('/'))) {
          Object.assign(effect, {type: 'CALL_API', method: 'GET', status: effect.urls.some(url => url.includes('{')) ? 'INFERRED' : 'CONFIRMED'});
          delete effect.targetRoutes;
        }
      }
  }
  const unique = new Map();
  for (const item of diagnostics) unique.set(JSON.stringify(item), item);
  return {screens, diagnostics: [...unique.values()].sort((a, b) => a.source.file.localeCompare(b.source.file) || a.source.line - b.source.line || a.code.localeCompare(b.code))};
}

function jsxOccurrences(modules) {
  const result = new Map();
  for (const module of modules.values()) {
    const counts = new Map();
    const visit = node => {
      if (node.type === 'JSXElement') {
        const name = jsxName(node.openingElement.name);
        const count = counts.get(name) ?? 0;
        counts.set(name, count + 1);
        result.set(node, `${module.file}#${name}#${count}`);
      }
      for (const child of children(node)) visit(child);
    };
    visit(module.ast.program);
  }
  return result;
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
  constructor(evaluator, occurrences, diagnostics, maxDepth) {
    this.evaluator = evaluator;
    this.occurrences = occurrences;
    this.diagnostics = diagnostics;
    this.maxDepth = maxDepth;
    this.sources = new Set();
    this.components = new Map();
    this.load = [];
    this.loaded = new Set();
    this.view = null;
  }

  render(route, shell = null) {
    this.routesElement = route.routesElement ?? null;
    this.reachedRoutes = false;
    this.routeElements = [...route.layouts, route.element].map(entry => entry.expr ?? entry.component);
    const outlets = [...route.layouts, route.element];
    const root = outlets.shift();
    const state = {guards: [], anchors: [], keys: [], stack: [], depth: 0, repeated: false, form: null, outlets};
    this.sources.add(route.file);
    this.routeFile = route.file;
    if (shell && this.routesElement) {
      this.sources.add(shell.file);
      this.pendingRoute = {root, state};
      this.expr(shell.expr, shell.scope, {...state, outlets: []});
    }
    if (!this.reachedRoutes) this.renderRoute(root, state);
    const components = [...this.components.values()];
    components.forEach(component => { component.behaviors = dedupe(component.behaviors); });
    return {
      route: route.path, file: route.file, line: route.line, layoutOnly: Boolean(route.layoutOnly),
      view: this.view?.name ?? 'Route', viewSource: this.view?.file ?? route.file,
      sources: [...this.sources].sort(), components: components.sort((a, b) => a.key.localeCompare(b.key)), load: dedupe(this.load)
    };
  }

  renderRoute(entry, state) {
    if (!entry) return;
    if (entry.expr) { this.expr(entry.expr, entry.scope, state); return; }
    const value = this.evaluator.evaluate(entry.component, entry.scope);
    if (value.t === 'fn') this.component(value, {t: 'props', attrs: new Map(), children: null}, entry.component, state, entry.scope.module.file);
  }

  expr(input, scope, state) {
    const node = unwrap(input);
    if (!node) return;
    switch (node.type) {
      case 'JSXElement': this.element(node, scope, state); return;
      case 'JSXFragment': this.childNodes(node.children, scope, state); return;
      case 'JSXExpressionContainer': this.expr(node.expression, scope, state); return;
      case 'ArrayExpression': node.elements.forEach(item => item && this.expr(item.type === 'SpreadElement' ? item.argument : item, scope, state)); return;
      case 'ConditionalExpression': {
        const truth = truthy(this.evaluator.evaluate(node.test, scope));
        const test = text(scope.module, node.test);
        if (truth !== false) this.expr(node.consequent, scope, truth ? state : guarded(state, test));
        if (truth !== true) this.expr(node.alternate, scope, truth === false ? state : guarded(state, `!(${test})`));
        return;
      }
      case 'LogicalExpression': {
        const truth = truthy(this.evaluator.evaluate(node.left, scope));
        if (node.operator === '&&') { if (truth !== false) this.expr(node.right, scope, truth ? state : guarded(state, text(scope.module, node.left))); return; }
        this.expr(node.left, scope, state);
        if (truth !== true) this.expr(node.right, scope, guarded(state, `!(${text(scope.module, node.left)})`));
        return;
      }
      case 'ArrowFunctionExpression': case 'FunctionExpression': this.body({t: 'fn', node, scope}, [], state, false); return;
      case 'CallExpression': case 'OptionalCallExpression': this.callExpr(node, scope, state); return;
      case 'Identifier': case 'MemberExpression': case 'OptionalMemberExpression': this.reference(node, scope, state); return;
      default:
    }
  }

  reference(node, scope, state) {
    if (state.stack.includes(node)) return;
    const value = this.evaluator.evaluate(node, scope);
    const next = {...state, stack: [...state.stack, node]};
    if (value.t === 'jsx') this.expr(value.node, value.scope, next);
    else if (value.t === 'children') this.childNodes(value.closure.nodes, value.closure.scope, {...next, anchors: value.closure.anchors, keys: value.closure.keys, form: value.closure.form ?? state.form});
    else if (value.t === 'array') this.expr(value.node, value.scope, next);
    else if (value.t === 'unknown' && node.type === 'Identifier') this.renderVariable(node, scope, next);
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
        elements.forEach((item, index) => this.body(fn, [{expr: item, scope: items.scope}, {value: {t: 'lit', v: index}}], {...state, keys: [...state.keys, `[${index}]`]}, false));
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
    node.arguments.forEach(arg => this.expr(arg, scope, state));
  }

  childNodes(nodes, scope, state) {
    for (const child of nodes ?? []) if (child.type !== 'JSXText') this.expr(child, scope, state);
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
    if (!this.view || this.routeElements.some(expr => expr && node.start >= expr.start && node.end <= expr.end && file === this.routeFile))
      this.view = {name: fn.name ?? 'Route', file: fn.scope.module.file};
    this.sources.add(fn.scope.module.file);
    const next = {...state, depth: state.depth + 1, stack: [...state.stack, fn.node], anchors: [...state.anchors, `${file}:${line(node)}`], keys: key ? [...state.keys, key] : state.keys};
    this.body(fn, [{value: props}], next, true);
  }

  /** Renders what a function returns; component bodies also contribute their page-load effects. */
  body(fn, args, state, isComponent) {
    const scope = this.evaluator.functionScope(fn.node, fn.scope, args, state.depth);
    if (isComponent) this.loadEffects(fn.node.body, scope, state, new Set([fn.node]));
    if (fn.node.body.type !== 'BlockStatement') { this.expr(fn.node.body, scope, state); return; }
    this.statements(fn.node.body.body, scope, state);
  }

  statements(list, scope, state) {
    let current = state;
    for (const statement of list) {
      if (this.statement(statement, scope, current)) return true;
      if (statement.type === 'IfStatement' && !statement.alternate && alwaysReturns(statement.consequent) && truthy(this.evaluator.evaluate(statement.test, scope)) === null)
        current = guarded(current, `!(${text(scope.module, statement.test)})`);
    }
    return false;
  }

  /** Returns true when the statement always returns, so later statements cannot render. */
  statement(node, scope, state) {
    switch (node?.type) {
      case 'ReturnStatement': this.expr(node.argument, scope, state); return true;
      case 'BlockStatement': return this.statements(node.body, scope, state);
      case 'IfStatement': {
        const truth = truthy(this.evaluator.evaluate(node.test, scope));
        const test = text(scope.module, node.test);
        if (truth === true) return this.statement(node.consequent, scope, state);
        if (truth === false) return node.alternate ? this.statement(node.alternate, scope, state) : false;
        const left = this.statement(node.consequent, scope, guarded(state, test));
        const right = node.alternate ? this.statement(node.alternate, scope, guarded(state, `!(${test})`)) : false;
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
      const to = attributeExpression(attribute(node, 'to'));
      const urls = to ? this.urlsOf(to, scope) : [];
      const behaviors = [this.effect('NAVIGATE', 'click', node, scope, state, {urls, expression: text(scope.module, to)})];
      behaviors.push(...this.handlers(node, scope, state).flatMap(handler => handler.effects));
      this.record(node, scope, state, key, {kind: 'LINK', tag: name, target: urls[0] ?? null, handlers: [], behaviors});
      return;
    }
    if (name === 'Navigate') {
      const to = attributeExpression(attribute(node, 'to'));
      this.addLoad(this.effect('NAVIGATE', 'load', node, scope, state, {urls: to ? this.urlsOf(to, scope) : [], expression: text(scope.module, node), redirect: true}));
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
    const attrs = this.staticAttributes(node, scope);
    const handlers = this.handlers(node, scope, state);
    const kind = intrinsicKind(tag, attrs, state.form !== null, handlers.length > 0);
    let next = state;
    if (kind) {
      const component = this.record(node, scope, state, key, {kind, tag, attrs, handlers, target: tag === 'a' ? attrs.href ?? null : null});
      if (tag === 'a' && attrs.href && !attrs.href.startsWith('#')) component.behaviors.push(this.effect('NAVIGATE', 'click', node, scope, state, {urls: cleanUrls([attrs.href]), expression: attrs.href}));
      if (kind === 'FORM') next = {...state, form: component};
      if (kind === 'SUBMIT' && state.form) {
        component.form = state.form.key;
        component.behaviors.push(...state.form.submitEffects.map(effect => ({...effect, event: 'click', viaForm: true})));
        state.form.submitters.push(component);
      }
    }
    this.childNodes(node.children, scope, next);
    if (kind === 'FORM' && next.form.submitters.length) next.form.behaviors = next.form.behaviors.filter(effect => effect.event !== 'submit' || effect.type === 'VALIDATE');
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
        if (value.t === 'unknown') result.push({event, expression: text(scope.module, expr), effects: [this.effect('UNKNOWN', event, expr, scope, state, {expression: text(scope.module, expr), status: 'UNRESOLVED'})]});
        continue;
      }
      const effects = new EffectRunner(this, event, state).run(value, [], new Set());
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
      key: instanceKey, file: scope.module.file, line: line(node), anchor: [...state.anchors, `${scope.module.file}:${line(node)}`].join(' > '),
      kind, tag, label: label.text, labelSource: label.source, attrs, target, guard: joinGuards(state.guards),
      repeated: state.repeated, form: null, behaviors: [...behaviors, ...handlers.flatMap(handler => handler.effects)], submitEffects, submitters: []
    };
    this.components.set(instanceKey, component);
    return component;
  }

  addLoad(effect) {
    const key = JSON.stringify([effect.type, effect.urls, effect.method, effect.source]);
    if (this.loaded.has(key)) return;
    this.loaded.add(key);
    this.load.push(effect);
  }

  effect(type, event, node, scope, state, extra = {}) {
    return {type, event, source: {file: scope.module.file, line: line(node)}, guard: joinGuards(state.guards ?? []), trace: [], expression: text(scope.module, node), status: 'CONFIRMED', ...extra};
  }

  /** Effects that run while the screen renders: `useEffect` bodies, also inside custom hooks. */
  loadEffects(body, scope, state, seen) {
    const visit = (node, guards) => {
      if (!node?.type || FUNCTIONS.has(node.type)) return;
      if (node.type === 'IfStatement') {
        visit(node.test, guards);
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
        const test = text(module, node.test);
        this.walk(node.consequent, scope, active, trace, [...guards, test]);
        this.walk(node.alternate, scope, active, trace, [...guards, `!(${test})`]);
        return;
      }
      case 'LogicalExpression': {
        this.walk(node.left, scope, active, trace, guards);
        const left = text(module, node.left);
        this.walk(node.right, scope, active, trace, [...guards, node.operator === '&&' ? left : `!(${left})`]);
        return;
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
    const extra = {trace};
    if (callee.type === 'Identifier' && callee.name === 'fetch' && !this.evaluator.lookup('fetch', scope)) {
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
      const urls = target ? this.renderer.urlsOf(target, scope) : [];
      if (target && !(this.evaluator.evaluate(target, scope).t === 'lit' && typeof this.evaluator.evaluate(target, scope).v === 'number'))
        this.effects.push(this.renderer.effect('NAVIGATE', this.event, node, scope, where, {...extra, urls, expression: text(scope.module, node)}));
    } else if (value.t === 'fn' && !active.has(value.node)) {
      const step = {callee: text(scope.module, callee).slice(0, 120), source: {file: scope.module.file, line: line(node)}};
      this.run(value, node.arguments.map(expr => ({expr, scope})), active, [...trace, step], guards);
    }
    if (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') this.walk(callee.object, scope, active, trace, guards);
    for (const argument of node.arguments) {
      const arg = unwrap(argument);
      if (arg && (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression')) this.run({t: 'fn', node: arg, scope}, [], active, trace, guards);
      else this.walk(arg, scope, active, trace, guards);
    }
  }

  fullPage(node, target, scope, guards, trace) {
    const where = {...this.state, guards: [...this.state.guards, ...guards]};
    this.effects.push(this.renderer.effect('NAVIGATE', this.event, node, scope, where, {trace, urls: cleanUrls(this.evaluator.strings(target, scope)), expression: text(scope.module, node).slice(0, 400), fullPage: true}));
  }

  methodOf(options, scope) {
    if (!options) return 'GET';
    const value = this.evaluator.property(this.evaluator.evaluate(options, scope), 'method');
    if (value.t === 'lit') return value.v === undefined || value.v === null ? 'GET' : String(value.v).toUpperCase();
    return null;
  }

  request(node, urlExpr, method, scope, where, extra) {
    const urls = urlExpr ? cleanUrls(this.evaluator.strings(urlExpr, scope)) : [];
    const status = urls.length === 0 || method === null ? 'UNRESOLVED' : urls.some(url => url.includes('{')) ? 'INFERRED' : 'CONFIRMED';
    this.effects.push(this.renderer.effect('CALL_API', this.event, node, scope, where, {...extra, urls, method, status, expression: text(scope.module, node).slice(0, 400)}));
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

function guarded(state, guard) {
  return {...state, guards: [...state.guards, guard]};
}

/** Keeps only URLs a request or navigation could use: absolute paths or http(s) URLs, without query or fragment. */
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
