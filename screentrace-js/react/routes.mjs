import { diagnostic, children, line, FUNCTIONS } from './modules.mjs';
import { unwrap, externalName } from './values.mjs';
import { parseExpression } from '@babel/parser';
import { jsxName, attribute, attributeExpression } from './jsx.mjs';

const ROUTER = new Set(['react-router-dom', 'react-router', 'react-router-native']);
const REACT = new Set(['react', 'preact/compat']);
const ROUTER_FACTORIES = new Set([
  'createBrowserRouter',
  'createHashRouter',
  'createMemoryRouter',
  'useRoutes',
]);
const DOM = new Set(['react-dom', 'react-dom/client']);
/** Each guard atom is read in the module it came from: a query guard imported from another file splits the route too. */
function findQueryEntryInSources(audience, modules, routeFile) {
  const fileOf = (atom) => atom.source?.file ?? routeFile,
    files = [...new Set((audience ?? []).map(fileOf))].sort();
  for (const file of [routeFile, ...files.filter((item) => item !== routeFile)]) {
    const found = findQueryEntry(
      (audience ?? []).filter((atom) => fileOf(atom) === file),
      modules.get(file),
    );
    if (found) return found;
  }
  return null;
}
function findQueryEntry(audience, module) {
  if (!module || !audience?.length) return null;
  const locationHooks = new Set(),
    searchHooks = new Set();
  for (const statement of module.ast.program.body)
    if (statement.type === 'ImportDeclaration' && ROUTER.has(statement.source.value))
      for (const specifier of statement.specifiers) {
        const imported = specifier.imported?.name ?? specifier.imported?.value;
        if (imported === 'useLocation') locationHooks.add(specifier.local.name);
        if (imported === 'useSearchParams') searchHooks.add(specifier.local.name);
      }
  const locations = new Set(),
    searchValues = new Set(),
    queryKeys = new Map();
  const visit = (node, fn) => {
    if (!node?.type) return;
    fn(node);
    for (const child of children(node)) visit(child, fn);
  };
  visit(module.ast.program, (node) => {
    if (node.type !== 'VariableDeclarator' || !node.init) return;
    const init = node.init;
    if (
      init.type === 'CallExpression' &&
      init.callee.type === 'Identifier' &&
      locationHooks.has(init.callee.name) &&
      node.id.type === 'Identifier'
    )
      locations.add(node.id.name);
    if (
      init.type === 'CallExpression' &&
      init.callee.type === 'Identifier' &&
      searchHooks.has(init.callee.name) &&
      node.id.type === 'ArrayPattern' &&
      node.id.elements[0]?.type === 'Identifier'
    )
      searchValues.add(node.id.elements[0].name);
  });
  visit(module.ast.program, (node) => {
    if (
      node.type !== 'VariableDeclarator' ||
      node.id.type !== 'Identifier' ||
      node.init?.type !== 'CallExpression'
    )
      return;
    const call = node.init,
      callee = call.callee;
    if (
      callee.type !== 'MemberExpression' ||
      callee.property.name !== 'get' ||
      call.arguments[0]?.type !== 'StringLiteral'
    )
      return;
    const receiver = callee.object;
    if (
      receiver.type === 'NewExpression' &&
      receiver.callee.type === 'Identifier' &&
      receiver.callee.name === 'URLSearchParams'
    ) {
      const search = receiver.arguments[0];
      if (
        search?.type === 'MemberExpression' &&
        search.property.name === 'search' &&
        search.object.type === 'Identifier' &&
        locations.has(search.object.name)
      )
        queryKeys.set(node.id.name, call.arguments[0].value);
    } else if (receiver.type === 'Identifier' && searchValues.has(receiver.name))
      queryKeys.set(node.id.name, call.arguments[0].value);
  });
  const isQueryAtom = (node) => {
    node = unwrap(node);
    if (
      node.type === 'BinaryExpression' &&
      node.operator === '===' &&
      node.left.type === 'Identifier' &&
      node.right.type === 'StringLiteral' &&
      queryKeys.has(node.left.name)
    )
      return { key: queryKeys.get(node.left.name), value: node.right.value };
    if (node.type === 'LogicalExpression' && node.operator === '||') {
      const a = isQueryAtom(node.left),
        b = isQueryAtom(node.right);
      if (a && b && a.key === b.key)
        return { key: a.key, values: [...(a.values ?? [a.value]), ...(b.values ?? [b.value])] };
    }
    return null;
  };
  for (const atom of audience) {
    if (!atom.truth) continue;
    let expression;
    try {
      expression = parseExpression(atom.text, { plugins: ['typescript'] });
    } catch {
      continue;
    }
    const candidates = [];
    const find = (node) => {
      node = unwrap(node);
      if (node.type === 'LogicalExpression' && node.operator === '||') {
        const query = isQueryAtom(node.left);
        if (query?.values) candidates.push({ query, b: node.right, a: node.left });
        find(node.left);
        find(node.right);
      } else for (const child of children(node)) find(child);
    };
    find(expression);
    const candidate = candidates[0];
    if (!candidate) continue;
    return {
      atom,
      key: candidate.query.key,
      values: [...new Set(candidate.query.values)],
      aText: atom.text.slice(candidate.a.start, candidate.a.end),
      bText: atom.text.slice(candidate.b.start, candidate.b.end),
    };
  }
  return null;
}
function isRouter(value, name) {
  return value.t === 'external' && ROUTER.has(value.specifier) && externalName(value) === name;
}
function isReact(value, name) {
  return (
    value.t === 'external' &&
    REACT.has(value.specifier) &&
    (externalName(value) === name || externalName(value) === 'React.' + name)
  );
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
      if (
        node.type === 'JSXElement' &&
        !insideRoute &&
        isRouter(elementValue(evaluator, node, scope), 'Routes')
      ) {
        const previous = routesElement;
        routesElement = node;
        for (const child of children(node)) visit(child, insideRoute);
        routesElement = previous;
        return;
      }
      if (
        node.type === 'JSXElement' &&
        !insideRoute &&
        isRouter(elementValue(evaluator, node, scope), 'Route')
      ) {
        const before = routes.length;
        collectJsxRoute(node, scope, '', [], module, evaluator, routes);
        for (const route of routes.slice(before)) route.routesElement = routesElement;
        return;
      }
      if (
        node.type === 'CallExpression' &&
        ROUTER_FACTORIES.has(routerFactory(evaluator, node, scope)) &&
        node.arguments[0]
      ) {
        const array = evaluator.evaluate(node.arguments[0], scope);
        if (array.t === 'array')
          collectObjectRoutes(array, '', [], module, evaluator, routes, diagnostics);
        else
          diagnostics.push(
            diagnostic(
              module.file,
              line(node),
              'REACT_ROUTES_UNRESOLVED',
              '路由設定不是可靜態判定的陣列',
            ),
          );
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
    const visit = (node) => {
      if (found || !node?.type) return;
      if (node.type === 'CallExpression') {
        const callee = unwrap(node.callee);
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.name === 'render' &&
          node.arguments[0]
        ) {
          const owner = unwrap(callee.object);
          const root =
            owner.type === 'CallExpression'
              ? evaluator.evaluate(owner.callee, scope)
              : evaluator.evaluate(owner, scope);
          const viaRoot =
            owner.type === 'CallExpression' &&
            root.t === 'external' &&
            DOM.has(root.specifier) &&
            externalName(root) === 'createRoot';
          const legacy = root.t === 'external' && DOM.has(root.specifier) && root.path.length === 0;
          const rootVariable =
            owner.type === 'Identifier' && isCreateRoot(evaluator, owner.name, scope);
          if (viaRoot || legacy || rootVariable) {
            found = { expr: node.arguments[0], scope, file: module.file };
            return;
          }
        }
        const value = evaluator.evaluate(callee, scope);
        if (
          value.t === 'external' &&
          DOM.has(value.specifier) &&
          ['render', 'hydrate', 'hydrateRoot'].includes(externalName(value))
        ) {
          const element =
            externalName(value) === 'hydrateRoot' ? node.arguments[1] : node.arguments[0];
          if (element) {
            found = { expr: element, scope, file: module.file };
            return;
          }
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
  return (
    callee.t === 'external' && DOM.has(callee.specifier) && externalName(callee) === 'createRoot'
  );
}
function routerFactory(evaluator, node, scope) {
  const callee = evaluator.evaluate(node.callee, scope);
  return callee.t === 'external' && ROUTER.has(callee.specifier) ? externalName(callee) : null;
}
function elementValue(evaluator, element, scope) {
  const name = element.openingElement.name;
  if (name.type === 'JSXIdentifier')
    return /^[a-z]/.test(name.name)
      ? { t: 'intrinsic', name: name.name }
      : evaluator.resolveName(name.name, scope);
  if (name.type === 'JSXMemberExpression')
    return evaluator.property(
      elementValue(evaluator, { openingElement: { name: name.object } }, scope),
      name.property.name,
    );
  return { t: 'intrinsic', name: jsxName(name) };
}
function joinRoute(parent, child) {
  if (child === undefined || child === null) return parent || '/';
  if (child.startsWith('/')) return child.replace(/\/{2,}/g, '/');
  return ((parent.endsWith('/') ? parent : parent + '/') + child).replace(/\/{2,}/g, '/');
}
function collectJsxRoute(element, scope, parent, layouts, module, evaluator, routes) {
  const pathValue = attribute(element, 'path')
    ? evaluator.evaluate(attributeExpression(attribute(element, 'path')), scope)
    : null;
  const index = attribute(element, 'index') !== null;
  const path =
    pathValue?.t === 'lit'
      ? joinRoute(parent, String(pathValue.v))
      : index || !attribute(element, 'path')
        ? parent || '/'
        : null;
  const rendered = routeElement(
    attribute(element, 'element'),
    attribute(element, 'Component') ?? attribute(element, 'component'),
    scope,
  );
  const nested = element.children.filter(
    (child) =>
      child.type === 'JSXElement' && isRouter(elementValue(evaluator, child, scope), 'Route'),
  );
  if (path === null) return;
  if (rendered && (!nested.length || index))
    routes.push({ path, file: module.file, line: line(element), element: rendered, layouts });
  else if (rendered && nested.length && !nested.some((child) => attribute(child, 'index')))
    routes.push({
      path,
      file: module.file,
      line: line(element),
      element: rendered,
      layouts,
      layoutOnly: true,
    });
  const nextLayouts = rendered ? [...layouts, rendered] : layouts;
  for (const child of nested)
    collectJsxRoute(child, scope, path, nextLayouts, module, evaluator, routes);
}
function routeElement(elementAttribute, componentAttribute, scope) {
  const expr = attributeExpression(elementAttribute);
  if (expr) return { expr, scope };
  const component = attributeExpression(componentAttribute);
  return component ? { component, scope } : null;
}
function collectObjectRoutes(array, parent, layouts, module, evaluator, routes, diagnostics) {
  for (const item of array.node.elements) {
    const route = item && evaluator.evaluate(item, array.scope);
    if (route?.t !== 'object') {
      if (item)
        diagnostics.push(
          diagnostic(
            module.file,
            line(item),
            'REACT_ROUTES_UNRESOLVED',
            '路由項目不是可靜態判定的物件',
          ),
        );
      continue;
    }
    const property = (name) =>
      route.node.properties.find(
        (p) => p.type === 'ObjectProperty' && !p.computed && (p.key.name ?? p.key.value) === name,
      )?.value;
    const pathValue = property('path') ? evaluator.evaluate(property('path'), route.scope) : null;
    const index = evaluator.evaluate(
      property('index') ?? { type: 'BooleanLiteral', value: false },
      route.scope,
    );
    const path = pathValue?.t === 'lit' ? joinRoute(parent, String(pathValue.v)) : parent || '/';
    const rendered = property('element')
      ? { expr: property('element'), scope: route.scope }
      : property('Component')
        ? { component: property('Component'), scope: route.scope }
        : null;
    const nested = property('children')
      ? evaluator.evaluate(property('children'), route.scope)
      : null;
    const routeLine = line(route.node);
    if (rendered && (nested?.t !== 'array' || (index.t === 'lit' && index.v)))
      routes.push({
        path,
        file: route.scope.module.file,
        line: routeLine,
        element: rendered,
        layouts,
      });
    if (nested?.t === 'array')
      collectObjectRoutes(
        nested,
        path,
        rendered ? [...layouts, rendered] : layouts,
        module,
        evaluator,
        routes,
        diagnostics,
      );
  }
}
/** Converts `/service/:id/edit` into a matcher that also accepts `{id}` placeholders from static URLs. */
function routePattern(route) {
  const parts = route
    .split('/')
    .filter(Boolean)
    .map((part) =>
      part === '*'
        ? '.*'
        : part.startsWith(':')
          ? '[^/]+'
          : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
  return new RegExp('^/' + parts.join('/') + '/?$');
}
function matchRoute(urls, patterns) {
  const targets = new Set();
  let inferred = false;
  for (const url of urls ?? []) {
    const path = String(url).split(/[?#]/, 1)[0];
    const exact = patterns.filter((item) => item.route === path);
    const found = exact.length
      ? exact
      : patterns.filter((item) => item.pattern.test(path) && !item.route.includes('*'));
    const fallback = found.length ? found : patterns.filter((item) => item.pattern.test(path));
    if (!exact.length || url.includes('{')) inferred = true;
    for (const item of fallback) targets.add(item.route);
  }
  const targetRoutes = [...targets].sort();
  return {
    targetRoutes,
    status:
      targetRoutes.length === 0
        ? 'UNRESOLVED'
        : targetRoutes.length > 1
          ? 'AMBIGUOUS'
          : inferred
            ? 'INFERRED'
            : 'CONFIRMED',
  };
}
function queryEntryTargets(urls, candidates) {
  const query = candidates.filter((screen) => screen.entryQuery),
    plain = candidates.filter((screen) => screen.queryEntryPlain);
  if (!query.length || !plain.length || !urls?.length) return null;
  const selected = new Map();
  for (const url of urls) {
    if (typeof url !== 'string' || /[{}]/.test(url)) return candidates;
    let parsed;
    try {
      parsed = new URL(url, 'http://screentrace.invalid');
    } catch {
      return candidates;
    }
    for (const entry of query) {
      const [key, values = ''] = entry.entryQuery.split('=', 2),
        value = parsed.searchParams.get(key),
        accepted = values.split('|');
      const target =
        value !== null && accepted.includes(value)
          ? entry
          : plain.find((item) => item.route === entry.route);
      if (target) selected.set(target.route + ':' + (target.entryQuery ?? 'plain'), target);
    }
  }
  return selected.size ? [...selected.values()] : null;
}

export {
  ROUTER,
  REACT,
  findQueryEntryInSources,
  findRoutes,
  findRootRender,
  elementValue,
  routePattern,
  matchRoute,
  queryEntryTargets,
};
