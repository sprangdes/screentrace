import { diagnostic, children, line, text, FUNCTIONS } from './modules.mjs';
import { unwrap, truthy, externalName } from './values.mjs';
import {
  element as htmlElement,
  htmlAttribute,
  isAllowedTag,
  jsxText,
  serialize,
  styleText,
  SAMPLE_TEXT,
} from './markup.mjs';
import { atoms, unique, implied, residualGuard, contradicts } from './audience.mjs';
import { resolveRouteFacts } from './route-conditions.mjs';
import {
  unguarded,
  guarded,
  alwaysReturns,
  joinGuards,
  mergeGuards,
  dedupe,
  returnBranches,
  wrapperFacts,
  branchIdentity,
} from './branches.mjs';
import { closeConditionalDialogs } from './dialogs.mjs';
import { EffectRunner } from './effects.mjs';
import { jsxName, attribute, attributeExpression } from './jsx.mjs';
import { ROUTER, REACT, elementValue } from './routes.mjs';
import {
  hasContent,
  textual,
  intrinsicKind,
  labelOf,
  LABEL_ATTRIBUTES,
  literalAlternatives,
} from './text.mjs';
import { hrefEntryUrls, cleanUrls, destinationCandidates } from './urls.mjs';

const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const PASS_THROUGH = new Set(['Fragment', 'StrictMode', 'Suspense', 'Profiler']);
const MAX_UNROLLED = 50;
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
    this.previewStates = new Map();
    this.routeComponentRoots = [];
    this.componentFrames = [];
  }

  render(route, shell = null) {
    this.evaluator.routePath = /[:*]/.test(route.path) ? null : route.path;
    this.facts = resolveRouteFacts(this.audience, this.evaluator);
    this.routesElement = route.routesElement ?? null;
    this.reachedRoutes = false;
    this.routePath = route.path;
    this.routeElements = [...route.layouts, route.element].map(
      (entry) => entry.expr ?? entry.component,
    );
    const outlets = [...route.layouts, route.element];
    const root = outlets.shift();
    const state = {
      guards: [],
      anchors: [],
      keys: [],
      stack: [],
      depth: 0,
      repeated: false,
      form: null,
      outlets,
      out: this.document,
      routeOrigin: true,
    };
    this.sources.add(route.file);
    this.routeFile = route.file;
    if (shell && this.routesElement) {
      this.sources.add(shell.file);
      this.pendingRoute = { root, state };
      this.expr(shell.expr, shell.scope, { ...state, outlets: [], routeOrigin: false });
    }
    if (!this.reachedRoutes) this.renderRoute(root, state);
    const redirectOnly =
      this.routeContent === 0 && this.load.some((effect) => effect.routeRedirect);
    const pageFrame = redirectOnly ? null : this.pageComponent(this.routeComponentRoots[0]);
    if (!redirectOnly && pageFrame)
      this.view = {
        name: pageFrame.name ?? 'Route',
        file: pageFrame.file,
        from: pageFrame.fn.node.loc?.start.line ?? 0,
        to: pageFrame.fn.node.loc?.end.line ?? 0,
      };
    const components = [...this.components.values()];
    const excludedBehaviors = [];
    const visible = (effect) => {
      if (
        !contradicts([
          ...this.facts,
          ...(effect.pruningFacts ?? atoms(effect.guard, effect.source)),
        ])
      )
        return true;
      excludedBehaviors.push({ ...effect, reason: '此身分下不顯示', audience: this.audience });
      return false;
    };
    components.forEach((component) => {
      component.behaviors = dedupe(component.behaviors).filter(visible);
      component.guard = residualGuard(
        component.guard,
        resolveRouteFacts(this.audience, this.evaluator),
      );
    });
    this.load = this.load.filter(visible);
    this.load.forEach((effect) => {
      effect.guard = residualGuard(effect.guard, resolveRouteFacts(this.audience, this.evaluator));
    });
    return {
      excludedBehaviors,
      variantDecision: this.variantDecision,
      audience: resolveRouteFacts(this.audience, this.evaluator),
      audienceOriginal: unique(this.audience),
      route: route.path,
      file: route.file,
      line: route.line,
      layoutOnly: Boolean(route.layoutOnly),
      view: redirectOnly ? 'Route' : (this.view?.name ?? 'Route'),
      viewSource: this.view?.file ?? route.file,
      // A route that renders nothing of its own and only redirects is a forwarding address, not a page.
      redirectOnly,
      // Redirects written in the screen's own component come first; a guard's "not signed in" redirect after.
      redirects: this.load
        .filter((effect) => effect.routeRedirect)
        .map((effect) => ({
          effect,
          own:
            !!this.view &&
            effect.source.file === this.view.file &&
            effect.source.line >= this.view.from &&
            effect.source.line <= this.view.to,
        })),
      sources: [...this.sources].sort(),
      components: components.sort((a, b) => a.key.localeCompare(b.key)),
      load: dedupe(this.load),
      ...(this.markup
        ? {
            previewState: [...this.previewStates.values()]
              .map((item) => ({
                name: item.name,
                value: this.previewValue(item.value),
                source: `${item.file}:${item.line}`,
              }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          }
        : {}),
      ...(this.markup ? { markup: serialize(closeConditionalDialogs(this.document)) } : {}),
    };
  }

  /** Renders the route's own elements; the shell around `<Routes>` is not part of the route. */
  renderRoute(entry, state) {
    if (!entry) return;
    this.inRoute++;
    try {
      if (entry.expr) {
        this.expr(entry.expr, entry.scope, state);
        return;
      }
      const value = this.evaluator.evaluate(entry.component, entry.scope);
      if (value.t === 'fn')
        this.component(
          value,
          { t: 'props', attrs: new Map(), children: null },
          entry.component,
          state,
          entry.scope.module.file,
        );
    } finally {
      this.inRoute--;
    }
  }

  expr(input, scope, state) {
    if (
      contradicts([
        ...this.facts,
        ...state.guards.flatMap((g) => atoms(g, { file: scope.module.file, line: line(input) })),
      ])
    )
      return;
    const node = unwrap(input);
    if (!node) return;
    switch (node.type) {
      case 'JSXElement':
        this.element(node, scope, state);
        return;
      case 'JSXFragment':
        this.childNodes(node.children, scope, state);
        return;
      case 'JSXExpressionContainer':
        this.expr(node.expression, scope, state);
        return;
      case 'StringLiteral':
      case 'NumericLiteral':
      case 'TemplateLiteral':
      case 'BinaryExpression':
        this.text(node, scope, state);
        return;
      case 'ArrayExpression':
        node.elements.forEach(
          (item) =>
            item && this.expr(item.type === 'SpreadElement' ? item.argument : item, scope, state),
        );
        return;
      case 'ConditionalExpression': {
        const truth = this.condition(node.test, scope);
        const test = text(scope.module, node.test);
        if (truth === null) {
          this.either(
            (out) => this.expr(node.consequent, scope, { ...guarded(state, test), out }),
            (out) => this.expr(node.alternate, scope, { ...guarded(state, `!(${test})`), out }),
            state,
          );
          return;
        }
        this.expr(truth ? node.consequent : node.alternate, scope, state);
        return;
      }
      case 'LogicalExpression': {
        const truth = this.condition(node.left, scope);
        if (node.operator === '&&') {
          if (truth !== false)
            this.expr(
              node.right,
              scope,
              truth ? state : guarded(state, text(scope.module, node.left)),
            );
          return;
        }
        if (!(truth === null && textual(node.right))) this.expr(node.left, scope, state);
        if (truth !== true)
          this.expr(node.right, scope, guarded(state, `!(${text(scope.module, node.left)})`));
        return;
      }
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        this.body({ t: 'fn', node, scope }, [], state, false);
        return;
      case 'CallExpression':
      case 'OptionalCallExpression':
        this.callExpr(node, scope, state);
        return;
      case 'Identifier':
      case 'MemberExpression':
      case 'OptionalMemberExpression':
        this.reference(node, scope, state);
        return;
      default:
    }
  }

  condition(node, scope) {
    const reachable = this.reachableStateCondition(node, scope);
    if (reachable !== null) return reachable;
    const known = truthy(this.evaluator.evaluate(node, scope));
    if (known !== null) return known;
    const expression = this.evaluator.expandAudience(node, scope) ?? text(scope.module, node);
    return implied(this.facts, expression);
  }

  reachableStateCondition(node, scope) {
    node = unwrap(node);
    if (!node) return null;
    if (node.type === 'UnaryExpression' && node.operator === '!') {
      const value = this.reachableStateCondition(node.argument, scope);
      return value === null ? null : !value;
    }
    if (node.type === 'Identifier') {
      const value = this.evaluator.evaluate(node, scope);
      if (value.t !== 'state-domain') return null;
      const outcomes = value.values.map((item) => truthy(item));
      return outcomes.length && outcomes.every((x) => x !== null && x === outcomes[0])
        ? outcomes[0]
        : null;
    }
    if (node.type === 'BinaryExpression' && ['===', '!=='].includes(node.operator)) {
      let left = this.evaluator.evaluate(node.left, scope),
        right = this.evaluator.evaluate(node.right, scope),
        domain;
      if (left.t === 'state-domain') {
        domain = left;
      } else if (right.t === 'state-domain') {
        domain = right;
        right = this.evaluator.evaluate(node.left, scope);
      }
      if (!domain || right.t !== 'lit') return null;
      const results = domain.values.map((item) => {
        const same = item.t === 'lit' && item.v === right.v;
        return node.operator === '===' ? same : !same;
      });
      return results.length && results.every((x) => x === results[0]) ? results[0] : null;
    }
    return null;
  }

  reference(node, scope, state) {
    if (state.stack.includes(node)) return;
    const value = this.evaluator.evaluate(node, scope);
    const next = { ...state, stack: [...state.stack, node] };
    if (value.t === 'jsx') this.expr(value.node, value.scope, next);
    else if (value.t === 'children') {
      const closure = value.closure,
        nested = closure.nodes.some(
          (child) =>
            child.type === 'JSXExpressionContainer' &&
            this.evaluator.evaluate(child.expression, closure.scope).t === 'children',
        );
      const single = this.singleComponentChild(closure);
      for (const child of closure.nodes) {
        const forwarded =
          child.type === 'JSXExpressionContainer' &&
          this.evaluator.evaluate(child.expression, closure.scope).t === 'children';
        this.expr(child, closure.scope, {
          ...next,
          passedChild: nested ? forwarded : single,
          anchors: closure.anchors,
          keys: closure.keys,
          form: closure.form ?? state.form,
        });
      }
    } else if (value.t === 'array') this.expr(value.node, value.scope, next);
    else if (value.t === 'lit' && (typeof value.v === 'string' || typeof value.v === 'number'))
      this.emitText(String(value.v), state);
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
    if (
      found?.entry?.kind === 'variable' &&
      found.entry.node.init &&
      !(found.entry.steps ?? []).length
    )
      this.expr(found.entry.node.init, found.scope, state);
    else if (found?.binding?.expr) this.expr(found.binding.expr, found.binding.scope, state);
  }

  callExpr(node, scope, state) {
    const callee = node.callee;
    const method =
      callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression'
        ? callee.property.name
        : null;
    if (['map', 'flatMap', 'forEach'].includes(method)) {
      const fn = this.evaluator.evaluate(node.arguments[0], scope);
      if (fn.t !== 'fn') return;
      const items = this.evaluator.evaluate(callee.object, scope);
      const elements = items.t === 'array' ? items.node.elements : null;
      if (
        elements &&
        elements.length <= MAX_UNROLLED &&
        elements.every((item) => item && item.type !== 'SpreadElement')
      ) {
        elements.forEach((item, index) =>
          this.body(
            fn,
            [{ expr: item, scope: items.scope }, { value: { t: 'lit', v: index } }],
            {
              ...state,
              keys: [...state.keys, `[${index}]`],
              anchors: [...state.anchors, `[${index}]`],
            },
            false,
          ),
        );
        return;
      }
      this.body(fn, [], { ...state, repeated: true }, false);
      return;
    }
    const value = this.evaluator.evaluate(callee, scope);
    if (value.t === 'children') {
      const closure = value.closure,
        args = node.arguments.map((expr) => ({ expr, scope }));
      for (const child of closure.nodes) {
        const fn = child.type === 'JSXExpressionContainer' ? unwrap(child.expression) : null;
        if (fn && (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression'))
          this.body(
            { t: 'fn', node: fn, scope: closure.scope },
            args,
            {
              ...state,
              anchors: closure.anchors,
              keys: closure.keys,
              form: closure.form ?? state.form,
            },
            false,
          );
        else
          this.expr(child, closure.scope, {
            ...state,
            passedChild: true,
            anchors: closure.anchors,
            keys: closure.keys,
            form: closure.form ?? state.form,
          });
      }
      return;
    }
    if (value.t === 'fn' && !state.stack.includes(value.node) && state.depth < this.maxDepth) {
      this.body(
        value,
        node.arguments.map((expr) => ({ expr, scope })),
        { ...state, stack: [...state.stack, value.node], depth: state.depth + 1 },
        false,
      );
      return;
    }
    const markupArguments = node.arguments.filter((arg) =>
      ['JSXElement', 'JSXFragment'].includes(unwrap(arg)?.type),
    );
    markupArguments.forEach((arg) => this.expr(arg, scope, state));
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
    const module = scope.module,
      key = this.occurrences.get(node) ?? `${module.file}#?#${line(node)}`;
    if (value.t === 'intrinsic') {
      this.intrinsic(node, value.name, scope, state, key);
      return;
    }
    if (value.t === 'external' && ROUTER.has(value.specifier)) {
      this.routerElement(node, externalName(value), scope, state, key);
      return;
    }
    if (
      value.t === 'external' &&
      REACT.has(value.specifier) &&
      PASS_THROUGH.has(externalName(value).replace(/^React\./, ''))
    ) {
      this.childNodes(node.children, scope, state);
      return;
    }
    if (value.t === 'fn') {
      const props = this.props(node, scope, state);
      this.component(value, props, node, state, module.file, key);
      return;
    }
    if (value.t === 'external') {
      // A UI library component rendered as a router link (reactstrap tag={Link}, react-bootstrap as={Link},
      // MUI component={Link}) navigates exactly like <Link to=…>.
      const routerLink = this.polymorphicRouterLink(node, scope);
      if (routerLink) {
        this.routerElement(node, routerLink, scope, state, key);
        return;
      }
      const handlers = this.handlers(node, scope, state);
      if (handlers.length)
        this.record(node, scope, state, key, {
          kind: 'OTHER',
          tag: jsxName(node.openingElement.name),
          handlers,
        });
      this.childNodes(node.children, scope, state);
      return;
    }
    const name = jsxName(node.openingElement.name);
    if (/\.(Provider|Consumer)$/.test(name)) {
      for (const child of node.children) {
        const fn = child.type === 'JSXExpressionContainer' ? unwrap(child.expression) : null;
        if (fn && (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression'))
          this.body({ t: 'fn', node: fn, scope }, [], state, false);
        else if (child.type !== 'JSXText') this.expr(child, scope, state);
      }
      return;
    }
    this.diagnostics.push(
      diagnostic(
        module.file,
        line(node),
        'REACT_COMPONENT_UNRESOLVED',
        `無法靜態解析元件 <${jsxName(node.openingElement.name)}>；只分析其子元素`,
      ),
    );
    this.childNodes(node.children, scope, state);
  }

  props(node, scope, state) {
    const attrs = new Map();
    let spread = false;
    for (const item of node.openingElement.attributes) {
      if (item.type === 'JSXSpreadAttribute') {
        const value = this.evaluator.evaluate(item.argument, scope);
        if (value.t === 'object') this.copySpreadProps(value, attrs, new Set());
        else spread = true;
        continue;
      }
      const expr = attributeExpression(item);
      if (expr) attrs.set(jsxName(item.name), { expr, scope });
    }
    const content = node.children.filter((child) => child.type !== 'JSXText' || child.value.trim());
    const children = content.length
      ? { nodes: content, scope, anchors: state.anchors, keys: state.keys, form: state.form }
      : attrs.has('children')
        ? null
        : null;
    return { t: 'props', attrs, children, spread };
  }

  copySpreadProps(value, attrs, seen) {
    if (value.t !== 'object' || seen.has(value.node)) return;
    seen.add(value.node);
    for (const property of value.node.properties) {
      if (property.type === 'SpreadElement') {
        this.copySpreadProps(this.evaluator.evaluate(property.argument, value.scope), attrs, seen);
        continue;
      }
      if (property.type !== 'ObjectProperty') continue;
      let key;
      if (!property.computed) key = property.key.name ?? property.key.value;
      else {
        const resolved = this.evaluator.evaluate(property.key, value.scope);
        if (resolved.t === 'lit') key = resolved.v;
      }
      if (key !== undefined && key !== null)
        attrs.set(String(key), { expr: property.value, scope: value.scope });
    }
  }

  component(fn, props, node, state, file, key = null) {
    if (state.stack.includes(fn.node)) {
      this.diagnostics.push(
        diagnostic(
          file,
          line(node),
          'REACT_RENDER_CYCLE',
          `元件 ${fn.name ?? '(匿名)'} 遞迴渲染；停止展開`,
        ),
      );
      return;
    }
    if (state.depth >= this.maxDepth) {
      this.diagnostics.push(
        diagnostic(
          file,
          line(node),
          'REACT_RENDER_DEPTH',
          `元件展開超過 ${this.maxDepth} 層；停止展開 ${fn.name ?? '(匿名)'}`,
        ),
      );
      return;
    }
    // The screen is named after the innermost component written in the route element, never a shell provider.
    if (
      this.inRoute &&
      this.routeElements.some(
        (expr) =>
          expr && node.start >= expr.start && node.end <= expr.end && file === this.routeFile,
      )
    )
      this.view = {
        name: fn.name ?? 'Route',
        file: fn.scope.module.file,
        from: fn.node.loc?.start.line ?? 0,
        to: fn.node.loc?.end.line ?? 0,
      };
    this.sources.add(fn.scope.module.file);
    const next = {
      ...state,
      passedChild: false,
      depth: state.depth + 1,
      stack: [...state.stack, fn.node],
      anchors: [...state.anchors, this.anchor(node, file)],
      keys: key ? [...state.keys, key] : state.keys,
    };
    let frame = null;
    if (state.routeOrigin) {
      frame = {
        fn,
        name: fn.name,
        file: fn.scope.module.file,
        node,
        scope: null,
        selfHasHtml: false,
        children: [],
        passedChildren: [],
        props,
      };
      const parent = this.componentFrames.at(-1);
      if (parent) {
        parent.children.push(frame);
        if (state.passedChild) parent.passedChildren.push(frame);
      } else this.routeComponentRoots.push(frame);
      if (parent && this.forwardsChildren(props)) parent.passedChildren.push(frame);
      this.componentFrames.push(frame);
    }
    try {
      this.body(fn, [{ value: props }], next, true);
    } finally {
      if (frame) this.componentFrames.pop();
    }
  }

  pageComponent(frame, candidate = null) {
    if (!frame) return candidate;
    const scope = frame.scope;
    const guard = wrapperFacts(frame.fn.node.body, scope, this.evaluator).length > 0;
    const passesChildren = this.componentPassesChildren(frame.fn.node.body, scope);
    const structural = guard || passesChildren;
    if (structural) {
      const child = frame.passedChildren[0] ?? null;
      return child ? this.pageComponent(child, candidate) : candidate;
    }
    const nextCandidate = frame;
    const returned = this.lastReturnComponent(frame);
    return returned ? this.pageComponent(returned, nextCandidate) : nextCandidate;
  }

  lastReturnComponent(frame) {
    const scope = frame.scope;
    if (!scope) return null;
    const branches = returnBranches(frame.fn.node.body, scope, this.evaluator);
    let chosen;
    const compatible = branches.filter(
      (branch) =>
        !contradicts([
          ...this.facts,
          ...branch.path.flatMap((item) => {
            const expanded = item.node && this.evaluator.expandAudience(item.node, scope);
            const expression = expanded
              ? item.expression.startsWith('!(')
                ? `!(${expanded})`
                : expanded
              : item.expression;
            return atoms(expression, { file: scope.module.file, line: line(item.node) });
          }),
        ]),
    );
    if (compatible.length === 1) chosen = compatible[0];
    else chosen = [...branches].sort((a, b) => (b.expr?.start ?? 0) - (a.expr?.start ?? 0))[0];
    let expr = unwrap(chosen?.expr);
    if (expr?.type === 'JSXExpressionContainer') expr = unwrap(expr.expression);
    if (expr?.type !== 'JSXElement' || elementValue(this.evaluator, expr, scope).t !== 'fn')
      return null;
    return frame.children.find((child) => child.node === expr) ?? null;
  }

  componentPassesChildren(body, scope) {
    let found = false;
    const visit = (node) => {
      if (!node?.type || found) return;
      if (FUNCTIONS.has(node.type)) return;
      if (
        ['Identifier', 'MemberExpression', 'OptionalMemberExpression'].includes(node.type) &&
        this.evaluator.evaluate(node, scope).t === 'children'
      ) {
        found = true;
        return;
      }
      if (
        ['JSXIdentifier', 'JSXMemberExpression'].includes(node.type) &&
        jsxName(node) === 'Outlet'
      ) {
        found = true;
        return;
      }
      for (const child of children(node)) visit(child);
    };
    visit(body);
    return found;
  }

  forwardsChildren(props) {
    const closure = props?.children;
    if (!closure?.nodes) return false;
    return closure.nodes.some(
      (node) =>
        node.type === 'JSXExpressionContainer' &&
        this.evaluator.evaluate(node.expression, closure.scope).t === 'children',
    );
  }

  singleComponentChild(closure) {
    if (!closure?.nodes) return false;
    const nodes = closure.nodes.filter((n) => n.type !== 'JSXText' || n.value.trim());
    return (
      nodes.length === 1 &&
      nodes[0].type === 'JSXElement' &&
      elementValue(this.evaluator, nodes[0], closure.scope).t === 'fn'
    );
  }

  /** Renders what a function returns; component bodies also contribute their page-load effects. */
  body(fn, args, state, isComponent) {
    const scope = this.evaluator.functionScope(fn.node, fn.scope, args, state.depth);
    if (isComponent && state.routeOrigin) {
      const frame = this.componentFrames.at(-1);
      if (frame?.fn.node === fn.node) frame.scope = scope;
    }
    if (isComponent && this.inRoute && state.routeCandidate !== false && !this.variantDecision) {
      const branches = returnBranches(fn.node.body, scope, this.evaluator);
      const pages = branches
        .map((b) => ({ ...b, identity: branchIdentity(b.expr, scope, this.evaluator) }))
        .filter((b) => b.identity);
      if (new Set(pages.map((b) => b.identity)).size > 1)
        this.variantDecision = pages.map((b) => ({
          facts: this.evaluator.transferContext.remember(
            b.path.flatMap((item) =>
              atoms(item.expression, { file: scope.module.file, line: line(item.node) }),
            ),
            scope,
          ),
        }));
    }
    if (isComponent)
      this.audience = unique([
        ...this.audience,
        ...this.evaluator.transferContext.remember(
          wrapperFacts(fn.node.body, scope, this.evaluator),
          scope,
        ),
      ]);
    if (isComponent) {
      this.prepareStateReachability(fn.node.body, scope);
      this.loadEffects(fn.node.body, scope, state, new Set([fn.node]));
      if (this.markup) this.preparePreviewState(fn.node.body, scope);
    }
    if (fn.node.body.type !== 'BlockStatement') {
      this.expr(fn.node.body, scope, state);
      return;
    }
    this.statements(fn.node.body.body, scope, state);
  }

  prepareStateReachability(body, scope) {
    const states = new Map(),
      helpers = new Map(),
      unknown = new Set(),
      parents = new WeakMap();
    const collect = (node, parent = null) => {
      if (!node?.type) return;
      if (parent) parents.set(node, parent);
      if (
        node.type === 'VariableDeclarator' &&
        node.id.type === 'ArrayPattern' &&
        node.init?.type === 'CallExpression'
      ) {
        const hook = this.evaluator.evaluate(node.init.callee, scope);
        if (
          hook.t === 'external' &&
          REACT.has(hook.specifier) &&
          externalName(hook) === 'useState'
        ) {
          const name = node.id.elements[0]?.name,
            setter = node.id.elements[1]?.name,
            initial = node.init.arguments[0]
              ? this.evaluator.evaluate(node.init.arguments[0], scope)
              : { t: 'lit', v: undefined };
          if (name && setter && initial.t === 'lit')
            states.set(setter, { name, values: [initial], writes: [] });
        }
      }
      for (const child of children(node)) collect(child, node);
    };
    collect(body);
    if (!states.size) return;
    const functionNodes = [];
    const findFns = (node) => {
      if (!node?.type) return;
      if (FUNCTIONS.has(node.type) && node !== body) functionNodes.push(node);
      for (const child of children(node)) findFns(child);
    };
    findFns(body);
    const setterByName = new Map([...states].map(([setter, record]) => [setter, record]));
    for (const fn of functionNodes) {
      const params = fn.params ?? [];
      const visit = (node) => {
        if (!node?.type || (node !== fn && FUNCTIONS.has(node.type))) return;
        if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
          const setter =
            node.callee.type === 'Identifier' ? setterByName.get(node.callee.name) : null;
          if (setter) {
            const arg = node.arguments[0];
            if (arg?.type === 'Identifier') {
              const index = params.findIndex(
                (param) => param.type === 'Identifier' && param.name === arg.name,
              );
              if (index >= 0) {
                if (!helpers.has(fn)) helpers.set(fn, []);
                helpers.get(fn).push({ record: setter, index });
              } else unknown.add(setter);
            } else if (
              arg?.type !== 'ArrowFunctionExpression' &&
              arg?.type !== 'FunctionExpression' &&
              this.evaluator.evaluate(arg, scope).t !== 'lit'
            )
              unknown.add(setter);
          }
        }
        for (const child of children(node)) visit(child);
      };
      visit(fn.body);
    }
    const isEvent = (node) => {
      for (let p = parents.get(node); p; p = parents.get(p))
        if (p.type === 'JSXAttribute' && /^on[A-Z]/.test(p.name?.name ?? '')) return true;
      return false;
    };
    const eventGuards = (node) => {
      const guards = [];
      for (let p = parents.get(node); p; p = parents.get(p)) {
        if (p.type === 'ConditionalExpression') {
          const isAlt = node.start >= p.alternate.start && node.end <= p.alternate.end;
          guards.push(isAlt ? `!(${text(scope.module, p.test)})` : text(scope.module, p.test));
        } else if (
          p.type === 'IfStatement' &&
          p.consequent &&
          node.start >= p.consequent.start &&
          node.end <= p.consequent.end
        )
          guards.push(text(scope.module, p.test));
        else if (
          p.type === 'IfStatement' &&
          p.alternate &&
          node.start >= p.alternate.start &&
          node.end <= p.alternate.end
        )
          guards.push(`!(${text(scope.module, p.test)})`);
        else if (
          p.type === 'LogicalExpression' &&
          p.operator === '&&' &&
          node.start >= p.right.start &&
          node.end <= p.right.end
        )
          guards.push(text(scope.module, p.left));
      }
      return guards;
    };
    const eligible = (node) =>
      !isEvent(node) ||
      !contradicts([
        ...this.facts,
        ...eventGuards(node).flatMap((value) =>
          atoms(value, { file: scope.module.file, line: line(node) }),
        ),
      ]);
    const visit = (node, parent = null) => {
      if (!node?.type) return;
      if (node.type === 'Identifier' && setterByName.has(node.name)) {
        const directCall =
          parent &&
          (parent.type === 'CallExpression' || parent.type === 'OptionalCallExpression') &&
          parent.callee === node;
        const declaration =
          parent?.type === 'ArrayPattern' || parent?.type === 'VariableDeclarator';
        if (!directCall && !declaration) unknown.add(setterByName.get(node.name));
      }
      if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
        const callee = this.evaluator.evaluate(node.callee, scope);
        let record = node.callee.type === 'Identifier' ? setterByName.get(node.callee.name) : null;
        if (record) {
          const arg = node.arguments[0];
          if (arg?.type === 'ArrowFunctionExpression' || arg?.type === 'FunctionExpression')
            unknown.add(record);
          else if (arg?.type === 'Identifier') {
            const owner = functionNodes.find((fn) => {
              let p = parents.get(node);
              while (p) {
                if (p === fn) return true;
                p = parents.get(p);
              }
              return false;
            });
            const helper =
              owner &&
              helpers
                .get(owner)
                ?.find(
                  (item) => item.record === record && owner.params[item.index]?.name === arg.name,
                );
            if (helper) {
              for (const call of this.findCalls(body, owner, scope)) {
                const value = this.evaluator.evaluate(call.arguments[helper.index], scope);
                if (value.t !== 'lit') unknown.add(record);
                else if (eligible(call)) record.values.push(value);
                record.writes.push({ file: scope.module.file, line: line(call) });
              }
            } else unknown.add(record);
          } else {
            const value = this.evaluator.evaluate(arg, scope);
            if (value.t === 'lit') {
              if (eligible(node)) record.values.push(value);
              record.writes.push({ file: scope.module.file, line: line(node) });
            } else unknown.add(record);
          }
        } else if (callee.t === 'fn' && helpers.has(callee.node))
          for (const item of helpers.get(callee.node)) {
            const value = this.evaluator.evaluate(node.arguments[item.index], scope);
            if (value.t !== 'lit') unknown.add(item.record);
            else if (eligible(node)) item.record.values.push(value);
            item.record.writes.push({ file: scope.module.file, line: line(node) });
          }
      }
      for (const child of children(node)) visit(child, node);
    };
    visit(body);
    for (const [, record] of states) {
      const value = unknown.has(record)
        ? { t: 'unknown' }
        : { t: 'state-domain', values: record.values };
      scope.bindings.set(record.name, { value });
    }
  }

  findCalls(body, fn, scope) {
    const calls = [];
    const visit = (node) => {
      if (!node?.type) return;
      if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
        const callee = this.evaluator.evaluate(node.callee, scope);
        if (callee.t === 'fn' && callee.node === fn) calls.push(node);
      }
      for (const child of children(node)) visit(child);
    };
    visit(body);
    return calls;
  }

  statements(list, scope, state) {
    for (let index = 0; index < list.length; index++) {
      const statement = list[index];
      if (
        statement.type === 'IfStatement' &&
        !statement.alternate &&
        alwaysReturns(statement.consequent) &&
        this.condition(statement.test, scope) === null
      ) {
        // `if (x) return <A/>; …rest` — both are recorded; the preview prefers the rest, the resting state.
        const test = text(scope.module, statement.test),
          rest = list.slice(index + 1);
        let restReturns = false;
        this.either(
          (out) => this.statement(statement.consequent, scope, { ...guarded(state, test), out }),
          (out) => {
            restReturns = this.statements(rest, scope, { ...guarded(state, `!(${test})`), out });
          },
          state,
        );
        return restReturns;
      }
      if (this.statement(statement, scope, state)) return true;
    }
    return false;
  }

  previewValue(value) {
    if (value?.t === 'lit') return value.v ?? null;
    if (value?.t === 'array')
      return value.node.elements
        .filter(Boolean)
        .map((item) => this.previewValue(this.evaluator.evaluate(item, value.scope)));
    if (value?.t === 'demo-array') return [{}];
    if (value?.t === 'demo-response' || value?.t === 'demo-value' || value?.t === 'object')
      return {};
    return null;
  }

  preparePreviewState(body, componentScope) {
    const states = new Map(),
      setters = new Map(),
      hooks = [],
      customHooks = [];
    const visit = (node, insideFunction = false) => {
      if (!node?.type) return;
      if (node !== body && FUNCTIONS.has(node.type)) return;
      if (
        node.type === 'VariableDeclarator' &&
        node.id.type === 'ArrayPattern' &&
        node.init?.type === 'CallExpression'
      ) {
        const callee = this.evaluator.evaluate(node.init.callee, componentScope);
        if (
          callee.t === 'external' &&
          REACT.has(callee.specifier) &&
          externalName(callee) === 'useState'
        ) {
          const name = node.id.elements[0]?.name,
            setter = node.id.elements[1]?.name;
          if (!name || !setter) return;
          const initial = node.init.arguments[0]
            ? this.evaluator.evaluate(node.init.arguments[0], componentScope)
            : { t: 'lit', v: undefined };
          const stateValue =
            initial.t === 'lit' || initial.t === 'array' || initial.t === 'object'
              ? initial
              : { t: 'unknown' };
          const record = {
            name,
            value: stateValue,
            file: componentScope.module.file,
            line: line(node),
            ownerScope: componentScope,
          };
          states.set(name, record);
          setters.set(setter, record);
          componentScope.bindings.set(name, { value: stateValue });
          componentScope.bindings.set(setter, { value: { t: 'preview-setter', record } });
        }
      }
      if (node.type === 'CallExpression') {
        const callee = this.evaluator.evaluate(node.callee, componentScope);
        if (
          callee.t === 'external' &&
          REACT.has(callee.specifier) &&
          EFFECT_HOOKS.has(externalName(callee))
        ) {
          const callback =
            node.arguments[0] && this.evaluator.evaluate(node.arguments[0], componentScope);
          if (callback.t === 'fn') hooks.push(callback);
        } else if (callee.t === 'fn' && this.functionUsesHooks(callee.node, callee.scope)) {
          const hookScope = this.evaluator.functionScope(
            callee.node,
            callee.scope,
            node.arguments.map((expr) => ({ expr, scope: componentScope })),
            1,
          );
          const localStates = new Map(),
            localHooks = [];
          this.collectPreviewHook(callee.node.body, hookScope, localStates, localHooks);
          for (const [key, record] of localStates) {
            const fullKey = `hook:${callee.node.start}:${key}`;
            states.set(fullKey, record);
            setters.set(record.setter, record);
          }
          hooks.push(...localHooks);
          const declarator = this.findCallBinding(body, node);
          customHooks.push({ scope: hookScope, fn: callee.node, declarator });
        }
      }
      for (const child of children(node)) visit(child, insideFunction);
    };
    visit(body);
    const active = new Set();
    for (const callback of hooks) this.simulatePreviewFunction(callback, [], active, 0);
    for (const hook of customHooks) {
      const returned = this.lastFunctionReturn(hook.fn.body);
      if (hook.declarator && returned)
        componentScope.bindings.set(hook.declarator.id.name, {
          value: this.evaluator.evaluate(returned, hook.scope),
        });
    }
    for (const record of states.values())
      this.previewStates.set(
        `${componentScope.module.file}:${componentScope.fn?.start}:${record.name}:${record.line}`,
        record,
      );
  }

  functionUsesHooks(fn, scope) {
    let found = false;
    const visit = (node) => {
      if (!node?.type || found || (node !== fn && FUNCTIONS.has(node.type))) return;
      if (node.type === 'CallExpression') {
        const value = this.evaluator.evaluate(node.callee, scope);
        if (
          value.t === 'external' &&
          REACT.has(value.specifier) &&
          ['useState', ...EFFECT_HOOKS].includes(externalName(value))
        )
          found = true;
      }
      for (const child of children(node)) visit(child);
    };
    visit(fn.body);
    return found;
  }

  collectPreviewHook(body, scope, states, hooks) {
    const visit = (node) => {
      if (!node?.type || (node !== body && FUNCTIONS.has(node.type))) return;
      if (
        node.type === 'VariableDeclarator' &&
        node.id.type === 'ArrayPattern' &&
        node.init?.type === 'CallExpression'
      ) {
        const callee = this.evaluator.evaluate(node.init.callee, scope);
        if (
          callee.t === 'external' &&
          REACT.has(callee.specifier) &&
          externalName(callee) === 'useState'
        ) {
          const name = node.id.elements[0]?.name,
            setter = node.id.elements[1]?.name;
          if (name && setter) {
            const initial = node.init.arguments[0]
                ? this.evaluator.evaluate(node.init.arguments[0], scope)
                : { t: 'lit', v: undefined },
              value = ['lit', 'array', 'object'].includes(initial.t) ? initial : { t: 'unknown' },
              record = {
                name,
                value,
                file: scope.module.file,
                line: line(node),
                ownerScope: scope,
                setter,
              };
            states.set(name, record);
            scope.bindings.set(name, { value });
            scope.bindings.set(setter, { value: { t: 'preview-setter', record } });
          }
        }
      }
      if (node.type === 'CallExpression') {
        const callee = this.evaluator.evaluate(node.callee, scope);
        if (
          callee.t === 'external' &&
          REACT.has(callee.specifier) &&
          EFFECT_HOOKS.has(externalName(callee))
        ) {
          const callback = node.arguments[0] && this.evaluator.evaluate(node.arguments[0], scope);
          if (callback.t === 'fn') hooks.push(callback);
        }
      }
      for (const child of children(node)) visit(child);
    };
    visit(body);
  }

  findCallBinding(body, call) {
    let found = null;
    const visit = (node) => {
      if (!node?.type || found || (node !== body && FUNCTIONS.has(node.type))) return;
      if (
        node.type === 'VariableDeclarator' &&
        node.init === call &&
        node.id.type === 'Identifier'
      ) {
        found = node;
        return;
      }
      for (const child of children(node)) visit(child);
    };
    visit(body);
    return found;
  }

  lastFunctionReturn(body) {
    let found = null;
    const visit = (node) => {
      if (!node?.type || (node !== body && FUNCTIONS.has(node.type))) return;
      if (node.type === 'ReturnStatement' && (!found || (node.start ?? 0) > (found.start ?? 0)))
        found = node;
      for (const child of children(node)) visit(child);
    };
    visit(body);
    return found?.argument ?? null;
  }

  simulatePreviewFunction(fn, args, active, depth) {
    if (depth >= this.maxDepth || active.has(fn.node)) return false;
    const scope = this.evaluator.functionScope(fn.node, fn.scope, args, depth + 1),
      next = new Set([...active, fn.node]);
    return this.simulatePreviewNode(fn.node.body, scope, next, depth + 1);
  }

  simulatePreviewNode(node, scope, active, depth) {
    if (!node?.type || FUNCTIONS.has(node.type)) return false;
    if (node.type === 'BlockStatement') {
      for (const statement of node.body)
        if (this.simulatePreviewNode(statement, scope, active, depth)) return true;
      return false;
    }
    if (node.type === 'TryStatement') {
      this.simulatePreviewNode(node.block, scope, active, depth);
      if (node.finalizer) this.simulatePreviewNode(node.finalizer, scope, active, depth);
      return false;
    }
    if (node.type === 'IfStatement') {
      const known = truthy(this.evaluator.evaluate(node.test, scope));
      if (known !== null)
        return this.simulatePreviewNode(
          known ? node.consequent : node.alternate,
          scope,
          active,
          depth,
        );
      // Unknown early exits are treated as not taken; unknown two-way effects are not applied.
      return false;
    }
    if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') return true;
    if (node.type === 'VariableDeclaration') {
      for (const declaration of node.declarations) {
        if (declaration.id.type !== 'Identifier' || !declaration.init) continue;
        const value = this.previewExpression(declaration.init, scope);
        if (value) scope.bindings.set(declaration.id.name, { value });
      }
      return false;
    }
    if (node.type === 'ExpressionStatement') {
      let expression = unwrap(node.expression);
      if (expression?.type === 'UnaryExpression') expression = unwrap(expression.argument);
      if (expression?.type === 'CallExpression' || expression?.type === 'OptionalCallExpression') {
        const callee = this.evaluator.evaluate(expression.callee, scope);
        if (callee.t === 'preview-setter') {
          const record = callee.record,
            arg = expression.arguments[0];
          let value;
          if (arg?.type === 'ArrowFunctionExpression' || arg?.type === 'FunctionExpression')
            value = { t: 'unknown' };
          else value = this.previewExpression(arg, scope) ?? { t: 'unknown' };
          record.value = value;
          record.file = scope.module.file;
          record.line = line(expression);
          record.ownerScope.bindings.set(record.name, { value });
          return false;
        }
        if (callee.t === 'fn')
          return this.simulatePreviewFunction(
            callee,
            expression.arguments.map((expr) => ({ expr, scope })),
            active,
            depth + 1,
          );
      }
      return false;
    }
    for (const child of children(node))
      if (this.simulatePreviewNode(child, scope, active, depth)) return true;
    return false;
  }

  previewExpression(expression, scope) {
    const node = unwrap(expression);
    if (!node) return null;
    if (node.type === 'AwaitExpression') {
      const call = unwrap(node.argument),
        lineNo = line(call);
      return this.load.some(
        (effect) =>
          effect.type === 'CALL_API' &&
          effect.source?.file === scope.module.file &&
          effect.source?.line === lineNo,
      )
        ? { t: 'demo-response' }
        : this.evaluator.evaluate(node.argument, scope);
    }
    if (node.type === 'ArrayExpression') return { t: 'array', node, scope };
    return this.evaluator.evaluate(node, scope);
  }

  /**
   * Renders two alternatives that cannot be told apart statically. Both contribute components and effects;
   * the preview keeps the second (the `else`/fall-through, usually the resting state) unless it is empty.
   */
  either(first, second, state) {
    if (!this.markup) {
      first(state.out);
      second(state.out);
      return;
    }
    const base = new Set(this.emitted);
    const run = (render) => {
      this.emitted = new Set(base);
      const out = htmlElement(null);
      render(out);
      return { out, emitted: this.emitted };
    };
    const a = run(first),
      b = run(second);
    const chosen = hasContent(b.out) ? b : a;
    this.emitted = chosen.emitted;
    state.out.children.push(...chosen.out.children);
  }

  /** Returns true when the statement always returns, so later statements cannot render. */
  statement(node, scope, state) {
    switch (node?.type) {
      case 'ReturnStatement':
        this.expr(node.argument, scope, state);
        return true;
      case 'BlockStatement':
        return this.statements(node.body, scope, state);
      case 'IfStatement': {
        const truth = this.condition(node.test, scope);
        const test = text(scope.module, node.test);
        if (truth === true) return this.statement(node.consequent, scope, state);
        if (truth === false)
          return node.alternate ? this.statement(node.alternate, scope, state) : false;
        let left = false,
          right = false;
        this.either(
          (out) => {
            left = this.statement(node.consequent, scope, { ...guarded(state, test), out });
          },
          (out) => {
            right = node.alternate
              ? this.statement(node.alternate, scope, { ...guarded(state, `!(${test})`), out })
              : false;
          },
          state,
        );
        return left && right;
      }
      case 'SwitchStatement': {
        const discriminant = this.evaluator.evaluate(node.discriminant, scope);
        if (discriminant.t === 'lit') {
          let start = node.cases.findIndex(
            (item) =>
              item.test &&
              this.evaluator.evaluate(item.test, scope).v === discriminant.v &&
              this.evaluator.evaluate(item.test, scope).t === 'lit',
          );
          if (start < 0) start = node.cases.findIndex((item) => !item.test);
          if (start >= 0) {
            for (const item of node.cases.slice(start)) {
              if (this.statements(item.consequent, scope, state)) return true;
              if (item.consequent.some((s) => s.type === 'BreakStatement')) return false;
            }
            return false;
          }
        }
        for (const item of node.cases)
          this.statements(
            item.consequent,
            scope,
            guarded(
              state,
              item.test
                ? `${text(scope.module, node.discriminant)} === ${text(scope.module, item.test)}`
                : `default`,
            ),
          );
        return false;
      }
      case 'TryStatement':
        this.statement(node.block, scope, state);
        if (node.handler) this.statement(node.handler.body, scope, state);
        return false;
      default:
        return false;
    }
  }

  routerElement(node, name, scope, state, key) {
    if (name === 'Outlet') {
      const [next, ...rest] = state.outlets;
      if (next) this.renderRoute(next, { ...state, outlets: rest, passedChild: true });
      return;
    }
    if (name === 'Link' || name === 'NavLink') {
      if (this.inRoute) this.routeContent++;
      const to = attributeExpression(attribute(node, 'to'));
      const click = attributeExpression(attribute(node, 'onClick')),
        contextWrites = click ? [...this.evaluator.transferContext.writes(click, scope)] : [];
      const choices = to ? this.destinationChoices(to, scope, state) : null;
      const urls = choices
        ? cleanUrls(choices.flatMap((c) => c.urls))
        : to
          ? this.urlsOf(to, scope)
          : [];
      const entryUrls = to ? this.evaluator.strings(to, scope) : [];
      const behaviors = choices
        ? choices.map((candidate) =>
            this.effect(
              'NAVIGATE',
              'click',
              node,
              scope,
              { ...unguarded(state), guards: candidate.conditions },
              { ...candidate, entryUrls, contextWrites, expression: text(scope.module, to) },
            ),
          )
        : [
            this.effect('NAVIGATE', 'click', node, scope, unguarded(state), {
              urls,
              entryUrls,
              contextWrites,
              expression: text(scope.module, to),
            }),
          ];
      behaviors.push(...this.handlers(node, scope, state).flatMap((handler) => handler.effects));
      const component = this.record(node, scope, state, key, {
        kind: 'LINK',
        tag: name,
        target: urls[0] ?? null,
        handlers: [],
        behaviors,
      });
      const out = this.output(node, 'a', scope, state, key);
      if (out.tag) {
        out.attributes['data-st-expansion-anchor'] = component.anchor;
        if (urls[0]) out.attributes.href = urls[0];
      }
      this.childNodes(node.children, scope, { ...state, out });
      return;
    }
    if (name === 'Navigate') {
      const to = attributeExpression(attribute(node, 'to'));
      const destinations = to ? this.destinationChoices(to, scope, state) : null;
      for (const candidate of destinations ?? [
        { urls: to ? this.urlsOf(to, scope) : [], conditions: [], trace: [] },
      ]) {
        const effect = this.effect(
          'NAVIGATE',
          'load',
          node,
          scope,
          { ...state, guards: [...state.guards, ...candidate.conditions] },
          {
            ...candidate,
            source: { file: scope.module.file, line: line(node) },
            expression: text(scope.module, node),
            redirect: true,
            routeRedirect: this.inRoute > 0,
          },
        );
        // A redirect in the shell around <Routes> is read under this route's fixed pathname, in the scope it was written in.
        if (!effect.routeRedirect)
          effect.shellRouteFacts = resolveRouteFacts(
            this.evaluator.transferContext.remember(
              state.guards.flatMap((g) => atoms(g, effect.source)),
              scope,
            ),
            this.evaluator,
          );
        this.addLoad(effect);
      }
      return;
    }
    if (
      name === 'Routes' &&
      node === this.routesElement &&
      this.pendingRoute &&
      !this.reachedRoutes
    ) {
      this.reachedRoutes = true;
      const { root, state: routeState } = this.pendingRoute;
      this.renderRoute(root, {
        ...routeState,
        guards: state.guards,
        anchors: state.anchors,
        keys: state.keys,
        stack: state.stack,
        depth: state.depth,
      });
      return;
    }
    if (name === 'Routes' || name === 'Route') {
      if (node === this.routesElement) return;
      this.diagnostics.push(
        diagnostic(
          scope.module.file,
          line(node),
          'REACT_NESTED_ROUTES',
          '元件內的巢狀 <Routes> 未展開為獨立畫面',
        ),
      );
      return;
    }
    this.childNodes(node.children, scope, state);
  }

  polymorphicRouterLink(node, scope) {
    for (const name of ['tag', 'as', 'component']) {
      const expr = attributeExpression(attribute(node, name));
      if (!expr) continue;
      const value = this.evaluator.evaluate(expr, scope);
      if (
        value.t === 'external' &&
        ROUTER.has(value.specifier) &&
        ['Link', 'NavLink'].includes(externalName(value))
      )
        return externalName(value);
    }
    return null;
  }

  destinationChoices(expr, scope, state) {
    const result = destinationCandidates(expr, scope, this.evaluator, this.maxDepth);
    if (!result.handled) {
      const transfer = this.evaluator.transferContext(
        state.guards.flatMap((g) => atoms(g, { file: scope.module.file, line: line(expr) })),
        scope,
      );
      if (!transfer.proofs.length) return null;
      return [
        {
          urls: this.urlsOf(expr, scope),
          conditions: [],
          destinationFacts: transfer.facts,
          contextIdentity: transfer.proofs.length > 0,
          trace: transfer.proofs.map((source) => ({
            callee: 'Context state/return identity',
            source,
          })),
        },
      ];
    }
    if (result.limited)
      this.diagnostics.push(
        diagnostic(
          scope.module.file,
          line(expr),
          'REACT_DESTINATION_LIMIT',
          '目的地分支超過安全展開限制，保留未解析候選',
        ),
      );
    return result.items
      .filter(
        (item) =>
          !contradicts([
            ...this.facts,
            ...state.guards.flatMap((g) => atoms(g, { file: scope.module.file, line: line(expr) })),
            ...(result.conditionsProvable ? item.conditions : []).flatMap((g) =>
              atoms(g, item.source),
            ),
          ]),
      )
      .map((item) => {
        const transfer = this.evaluator.transferContext(
          [...state.guards, ...(result.conditionsProvable ? item.conditions : [])].flatMap((g) =>
            atoms(g, item.source),
          ),
          scope,
        );
        return {
          ...item,
          ...(!result.conditionsProvable
            ? { pruningFacts: state.guards.flatMap((g) => atoms(g, item.source)) }
            : {}),
          urls: cleanUrls(item.urls),
          destinationFacts: transfer.facts,
          contextIdentity: transfer.proofs.length > 0,
          trace: [
            ...item.trace,
            ...transfer.proofs.map((source) => ({
              callee: 'Context state/return identity',
              source,
            })),
          ],
        };
      });
  }

  urlsOf(expr, scope) {
    const value = this.evaluator.evaluate(expr, scope);
    if (value.t === 'object') {
      const pathname = value.node.properties.find(
        (p) => p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === 'pathname',
      );
      return pathname ? cleanUrls(this.evaluator.strings(pathname.value, value.scope)) : [];
    }
    if (value.t === 'lit' && typeof value.v === 'number') return [];
    return cleanUrls(this.evaluator.strings(expr, scope));
  }

  intrinsic(node, tag, scope, state, key) {
    if (state.routeOrigin && this.componentFrames.length)
      this.componentFrames.at(-1).selfHasHtml = true;
    if (this.inRoute) this.routeContent++;
    const attrs = this.staticAttributes(node, scope);
    const handlers = this.handlers(node, scope, state);
    const kind = intrinsicKind(tag, attrs, state.form !== null, handlers.length > 0);
    const out = this.output(node, tag, scope, state, key);
    let next = { ...state, out, routeCandidate: false };
    if (kind) {
      const component = this.record(node, scope, state, key, {
        kind,
        tag,
        attrs,
        handlers,
        target: tag === 'a' ? (attrs.href ?? null) : null,
      });
      if (out.tag) out.attributes['data-st-expansion-anchor'] = component.anchor;
      if (tag === 'a' && attrs.href && !attrs.href.startsWith('#'))
        component.behaviors.push(
          this.effect('NAVIGATE', 'click', node, scope, unguarded(state), {
            urls: cleanUrls([attrs.href]),
            entryUrls: hrefEntryUrls(this.evaluator, node, scope, attrs.href),
            expression: attrs.href,
            fullPage: true,
          }),
        );
      if (kind === 'FORM') next = { ...next, form: component };
      if (kind === 'SUBMIT' && state.form) {
        component.form = state.form.key;
        component.behaviors.push(
          ...state.form.submitEffects.map((effect) => ({
            ...effect,
            event: 'click',
            viaForm: true,
          })),
        );
        state.form.submitters.push(component);
      }
    }
    this.childNodes(node.children, scope, next);
    if (kind === 'FORM' && next.form.submitters.length)
      next.form.behaviors = next.form.behaviors.filter(
        (effect) => effect.event !== 'submit' || effect.type === 'VALIDATE',
      );
  }

  /**
   * The HTML element for one rendered JSX element. An element already emitted on another render path
   * (a wrapper returning `children` from two branches) gets a detached node so the preview shows it once.
   */
  output(node, tag, scope, state, key) {
    const instanceKey = [...state.keys, key].join(' > ');
    if (!this.markup || !isAllowedTag(tag) || this.emitted.has(instanceKey))
      return htmlElement(null);
    this.emitted.add(instanceKey);
    const attributes = {
      'data-st-source-file': scope.module.file,
      'data-st-source-line': String(line(node)),
    };
    for (const item of node.openingElement.attributes) {
      if (item.type !== 'JSXAttribute') continue;
      const name = jsxName(item.name),
        expr = attributeExpression(item);
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
      if (item.t === 'lit' && ['string', 'number'].includes(typeof item.v))
        entries.push([property.key.name ?? String(property.key.value), item.v]);
    }
    return styleText(entries) || undefined;
  }

  /** The resting class list: the shortest fully proven alternative, otherwise the proven parts only. */
  classOf(expr, scope) {
    const options = this.evaluator.strings(expr, scope);
    const proven = options
      .filter((item) => !item.includes('{'))
      .sort((a, b) => a.length - b.length || a.localeCompare(b));
    const chosen = proven[0] ?? options[0]?.replace(/\{[^{}]*\}/g, ' ') ?? '';
    return chosen.split(/\s+/).filter(Boolean).join(' ') || undefined;
  }

  staticAttributes(node, scope) {
    const attrs = {};
    for (const item of node.openingElement.attributes) {
      if (item.type !== 'JSXAttribute') continue;
      const name = jsxName(item.name);
      if (
        ![
          'type',
          'name',
          'id',
          'href',
          'role',
          'className',
          'placeholder',
          'title',
          'aria-label',
          'value',
          'multiple',
          'action',
          'method',
          'required',
          'alt',
          'htmlFor',
          'disabled',
        ].includes(name)
      )
        continue;
      const expr = attributeExpression(item);
      const value = expr ? this.evaluator.evaluate(expr, scope) : null;
      if (value?.t === 'lit' && value.v !== undefined && value.v !== null && value.v !== false)
        attrs[name] = String(value.v);
      else if (value && name === 'href')
        attrs[name] = cleanUrls(this.evaluator.strings(expr, scope))[0] ?? text(scope.module, expr);
      else if (value && LABEL_ATTRIBUTES.has(name)) {
        const options = literalAlternatives(this.evaluator, expr, scope);
        if (options) attrs[name] = options;
      }
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
        if (value.t === 'unknown')
          result.push({
            event,
            expression: text(scope.module, expr),
            effects: [
              this.effect('UNKNOWN', event, expr, scope, unguarded(state), {
                expression: text(scope.module, expr),
                status: 'UNRESOLVED',
              }),
            ],
          });
        continue;
      }
      const effects = new EffectRunner(this, event, unguarded(state)).run(
        value,
        value.node.params.map(() => ({ value: { t: 'unknown' } })),
        new Set(),
      );
      result.push({ event, expression: text(scope.module, expr), effects });
    }
    return result;
  }

  record(
    node,
    scope,
    state,
    key,
    { kind, tag, attrs = {}, handlers = [], target = null, behaviors = [] },
  ) {
    const instanceKey = [...state.keys, key].join(' > ');
    const existing = this.components.get(instanceKey);
    if (existing) {
      existing.guard = mergeGuards(existing.guard, joinGuards(state.guards));
      return existing;
    }
    const label = labelOf(node, attrs, this.evaluator, scope, kind);
    const submitEffects =
      kind === 'FORM' ? handlers.filter((h) => h.event === 'submit').flatMap((h) => h.effects) : [];
    const component = {
      key: instanceKey,
      file: scope.module.file,
      line: line(node),
      anchor: [...state.anchors, this.anchor(node, scope.module.file)].join(' > '),
      kind,
      tag,
      label: label.text,
      labelSource: label.source,
      attrs,
      target,
      guard: joinGuards(state.guards),
      repeated: state.repeated,
      form: null,
      behaviors: [...behaviors, ...handlers.flatMap((handler) => handler.effects)],
      submitEffects,
      submitters: [],
    };
    this.components.set(instanceKey, component);
    return component;
  }

  addLoad(effect) {
    const key = JSON.stringify([
      effect.type,
      effect.urls,
      effect.method,
      effect.source,
      ...(effect.type === 'NAVIGATE' ? [effect.guard] : []),
    ]);
    if (this.loaded.has(key)) return;
    this.loaded.add(key);
    this.load.push(effect);
  }

  effect(type, event, node, scope, state, extra = {}) {
    return {
      type,
      event,
      source: { file: scope.module.file, line: line(node) },
      contextGuardFacts: this.evaluator.transferContext.effectFacts(state.guards ?? [], scope, {
        file: scope.module.file,
        line: line(node),
      }),
      guard: joinGuards(state.guards ?? []),
      trace: [],
      expression: text(scope.module, node),
      status: 'CONFIRMED',
      ...extra,
    };
  }

  /** Effects that run while the screen renders: `useEffect` bodies, also inside custom hooks. */
  loadEffects(body, scope, state, seen) {
    const visit = (node, guards) => {
      if (!node?.type || FUNCTIONS.has(node.type)) return;
      if (node.type === 'IfStatement') {
        visit(node.test, guards);
        const known = truthy(this.evaluator.evaluate(node.test, scope));
        if (known !== null) {
          visit(known ? node.consequent : node.alternate, guards);
          return;
        }
        visit(node.consequent, [...guards, text(scope.module, node.test)]);
        visit(node.alternate, [...guards, `!(${text(scope.module, node.test)})`]);
        return;
      }
      if (node.type === 'CallExpression') {
        const callee = this.evaluator.evaluate(node.callee, scope);
        if (
          callee.t === 'external' &&
          REACT.has(callee.specifier) &&
          EFFECT_HOOKS.has(externalName(callee).replace(/^React\./, ''))
        ) {
          const fn = node.arguments[0] && this.evaluator.evaluate(node.arguments[0], scope);
          if (fn?.t === 'fn')
            for (const effect of new EffectRunner(this, 'load', {
              ...state,
              guards: [...state.guards, ...guards],
            }).run(fn, [], new Set()))
              this.addLoad(effect);
          return;
        }
        if (
          callee.t === 'fn' &&
          /^use[A-Z0-9]/.test(callee.name ?? '') &&
          !seen.has(callee.node) &&
          state.depth < this.maxDepth
        ) {
          const inner = this.evaluator.functionScope(
            callee.node,
            callee.scope,
            node.arguments.map((expr) => ({ expr, scope })),
            state.depth + 1,
          );
          this.sources.add(callee.scope.module.file);
          this.loadEffects(
            callee.node.body,
            inner,
            { ...state, depth: state.depth + 1, guards: [...state.guards, ...guards] },
            new Set([...seen, callee.node]),
          );
        }
      }
      for (const child of children(node)) visit(child, guards);
    };
    visit(body, []);
  }
}

export { ScreenRenderer };
