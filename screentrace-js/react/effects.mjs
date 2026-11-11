import { diagnostic, children, line, text, FUNCTIONS } from './modules.mjs';
import { unwrap, truthy, conditionText } from './values.mjs';
import { conditionsIn, alwaysReturns, hasEarlyExit } from './branches.mjs';
import { isLocation, isRelativeUrl, resolveAgainstRoute, cleanUrls } from './urls.mjs';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
/** Follows a handler through local, imported and prop-supplied functions to the requests and navigation it performs. */
class EffectRunner {
  constructor(renderer, event, state) {
    this.renderer = renderer;
    this.evaluator = renderer.evaluator;
    this.event = event;
    this.state = state;
    this.effects = [];
    this.contextWrites = new Set();
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
      case 'IfStatement':
      case 'ConditionalExpression': {
        this.walk(node.test, scope, active, trace, guards);
        const known = truthy(this.evaluator.evaluate(node.test, scope));
        if (known !== null) {
          this.walk(known ? node.consequent : node.alternate, scope, active, trace, guards);
          return;
        }
        const test = text(module, node.test);
        const previous = new Set(this.contextWrites);
        this.walk(node.consequent, scope, active, trace, [...guards, test]);
        const left = new Set(this.contextWrites);
        this.contextWrites = new Set(previous);
        this.walk(node.alternate, scope, active, trace, [...guards, `!(${test})`]);
        this.contextWrites = new Set([...left, ...this.contextWrites]);
        return;
      }
      case 'LogicalExpression': {
        this.walk(node.left, scope, active, trace, guards);
        const value = this.evaluator.evaluate(node.left, scope),
          known = truthy(value);
        if (
          (node.operator === '&&' && known === false) ||
          (node.operator === '||' && known === true) ||
          (node.operator === '??' && value.t === 'lit' && value.v != null)
        )
          return;
        const left = text(module, node.left);
        this.walk(node.right, scope, active, trace, [
          ...guards,
          node.operator === '&&' ? left : `!(${left})`,
        ]);
        return;
      }
      case 'BlockStatement': {
        // After `if (x) return;` the rest of the block only runs when `x` is false.
        let current = guards;
        for (const statement of node.body) {
          this.walk(statement, scope, active, trace, current);
          if (['ReturnStatement', 'ThrowStatement'].includes(statement.type)) break;
          if (statement.type === 'IfStatement') {
            const known = truthy(this.evaluator.evaluate(statement.test, scope));
            if (known !== null && alwaysReturns(known ? statement.consequent : statement.alternate))
              break;
          }
          if (
            statement.type === 'IfStatement' &&
            !statement.alternate &&
            alwaysReturns(statement.consequent)
          )
            current = [...current, `!(${text(module, statement.test)})`];
        }
        return;
      }
      case 'ForInStatement': {
        const object = this.evaluator.evaluate(node.right, scope),
          id = node.left.type === 'VariableDeclaration' ? node.left.declarations[0]?.id : node.left;
        if (object.t === 'object' && id?.type === 'Identifier') {
          const inner = {
            ...scope,
            bindings: new Map([
              [
                id.name,
                { value: { t: 'dispatch-key', object, complete: !hasEarlyExit(node.body) } },
              ],
            ]),
            locals: new Map(),
            parent: scope,
          };
          this.walk(node.body, inner, active, trace, guards);
          return;
        }
        break;
      }
      case 'CallExpression':
      case 'OptionalCallExpression':
      case 'NewExpression':
        this.call(node, scope, active, trace, guards);
        return;
      case 'AssignmentExpression':
        if (isLocation(node.left, this.evaluator, scope, true))
          this.fullPage(node, node.right, scope, guards, trace);
        this.walk(node.right, scope, active, trace, guards);
        return;
      default:
        for (const child of children(node)) this.walk(child, scope, active, trace, guards);
    }
  }

  call(node, scope, active, trace, guards) {
    const callee = unwrap(node.callee);
    const value =
      node.type === 'NewExpression' ? { t: 'unknown' } : this.evaluator.evaluate(callee, scope);
    const where = { ...this.state, guards: [...this.state.guards, ...guards] };
    if (this.dispatch(node, callee, scope, active, trace, guards)) return;
    if (
      ['MemberExpression', 'OptionalMemberExpression'].includes(callee.type) &&
      !callee.computed &&
      ['map', 'forEach'].includes(callee.property.name)
    ) {
      const keys = this.evaluator.evaluate(callee.object, scope),
        callback = node.arguments[0] && this.evaluator.evaluate(node.arguments[0], scope);
      if (keys.t === 'object-keys' && callback?.t === 'fn') {
        this.run(
          callback,
          [
            {
              value: {
                t: 'dispatch-key',
                object: keys.object,
                complete: !hasEarlyExit(callback.node.body),
              },
            },
          ],
          active,
          trace,
          guards,
        );
        return;
      }
    }
    for (const id of this.evaluator.transferContext.writes(callee, scope))
      this.contextWrites.add(id);
    for (const argument of node.arguments)
      for (const id of this.evaluator.transferContext.writesIn(argument, scope))
        this.contextWrites.add(id);
    const extra = { trace, contextWrites: [...this.contextWrites] };
    if (
      callee.type === 'Identifier' &&
      callee.name === 'fetch' &&
      !this.evaluator.lookup('fetch', scope)
    ) {
      if (!this.pairedRequest(node, node.arguments[0], node.arguments[1], scope, where, extra))
        this.request(
          node,
          node.arguments[0],
          this.methodOf(node.arguments[1], scope),
          scope,
          where,
          extra,
        );
    } else if (value.t === 'external' && value.specifier === 'axios') {
      const name = value.path.at(-1);
      if (value.path.length === 0 || name === 'request') {
        const config = node.arguments[0] && this.evaluator.evaluate(node.arguments[0], scope);
        const url =
          config?.t === 'object'
            ? config.node.properties.find(
                (p) => p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === 'url',
              )?.value
            : null;
        this.request(
          node,
          url ?? null,
          config ? this.methodOf(node.arguments[0], scope) : 'GET',
          url ? config.scope : scope,
          where,
          extra,
        );
      } else if (HTTP_METHODS.has(name))
        this.request(node, node.arguments[0], name.toUpperCase(), scope, where, extra);
    } else if (
      (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') &&
      !callee.computed &&
      ['assign', 'replace'].includes(callee.property.name) &&
      isLocation(callee.object, this.evaluator, scope, false)
    ) {
      if (node.arguments[0]) this.fullPage(node, node.arguments[0], scope, guards, trace);
    } else if (value.t === 'navigate') {
      const target = node.arguments[0];
      const candidates = target ? this.renderer.destinationChoices(target, scope, where) : null;
      if (candidates) {
        const entryUrls = this.evaluator.strings(target, scope);
        for (const candidate of candidates)
          this.effects.push(
            this.renderer.effect(
              'NAVIGATE',
              this.event,
              node,
              scope,
              { ...where, guards: [...where.guards, ...candidate.conditions] },
              {
                ...candidate,
                entryUrls,
                contextWrites: [...this.contextWrites],
                source: { file: scope.module.file, line: line(node) },
                trace: [...trace, ...candidate.trace],
                expression: text(scope.module, node),
              },
            ),
          );
      } else if (
        target &&
        !(
          this.evaluator.evaluate(target, scope).t === 'lit' &&
          typeof this.evaluator.evaluate(target, scope).v === 'number'
        )
      )
        this.effects.push(
          this.renderer.effect('NAVIGATE', this.event, node, scope, where, {
            ...extra,
            urls: this.renderer.urlsOf(target, scope),
            entryUrls: this.evaluator.strings(target, scope),
            expression: text(scope.module, node),
          }),
        );
    } else if (value.t === 'fn' && !active.has(value.node)) {
      const step = {
        callee: text(scope.module, callee).slice(0, 120),
        source: { file: scope.module.file, line: line(node) },
      };
      this.run(
        value,
        node.arguments.map((expr) => ({ expr, scope })),
        active,
        [...trace, step],
        guards,
      );
    }
    if (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression')
      this.walk(callee.object, scope, active, trace, guards);
    for (const argument of node.arguments) {
      const arg = unwrap(argument);
      if (arg && (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression'))
        this.run(
          { t: 'fn', node: arg, scope },
          arg.params.map(() => ({ value: { t: 'unknown' } })),
          active,
          trace,
          guards,
        );
      else this.walk(arg, scope, active, trace, guards);
    }
  }

  dispatch(node, callee, scope, active, trace, guards) {
    if (!['MemberExpression', 'OptionalMemberExpression'].includes(callee.type) || !callee.computed)
      return false;
    const object = this.evaluator.evaluate(callee.object, scope);
    if (object.t !== 'object') return false;
    const properties = object.node.properties;
    if (properties.length > 20) {
      this.renderer.diagnostics.push(
        diagnostic(
          scope.module.file,
          line(node),
          'REACT_DISPATCH_TABLE_TOO_LARGE',
          '分派表超過 20 個屬性，保留未解析呼叫',
        ),
      );
      return true;
    }
    if (
      properties.some(
        (p) =>
          !['ObjectProperty', 'ObjectMethod'].includes(p.type) || (p.kind && p.kind !== 'method'),
      )
    )
      return true;
    const names = [];
    for (const p of properties) {
      const key = p.computed
        ? this.evaluator.evaluate(p.key, object.scope)
        : { t: 'lit', v: p.key.name ?? p.key.value };
      if (key.t !== 'lit') return true;
      names.push(String(key.v));
    }
    const key = this.evaluator.evaluate(callee.property, scope),
      fixed = key.t === 'lit' && key.v !== undefined,
      iteration =
        key.t === 'dispatch-key' &&
        key.object.node === object.node &&
        key.object.scope === object.scope &&
        key.complete;
    const selected = fixed ? [String(key.v)] : [...new Set(names)].sort(),
      inferred = !fixed && !iteration;
    const step = {
      callee: text(scope.module, callee),
      dispatch: fixed
        ? '分派表，key 常值'
        : iteration
          ? '分派表，全部 key 迭代'
          : '分派表，key 未定',
      source: { file: scope.module.file, line: line(node) },
    };
    const start = this.effects.length;
    for (const name of selected) {
      const fn = this.evaluator.property(object, name);
      if (fn.t === 'fn')
        this.run(
          fn,
          node.arguments.map((expr) => ({ expr, scope })),
          active,
          [...trace, step],
          guards,
        );
    }
    if (inferred)
      for (const effect of this.effects.slice(start))
        if (effect.status === 'CONFIRMED') effect.status = 'INFERRED';
    for (const arg of node.arguments) this.walk(arg, scope, active, trace, guards);
    return true;
  }

  fullPage(node, target, scope, guards, trace) {
    const where = { ...this.state, guards: [...this.state.guards, ...guards] };
    this.effects.push(
      this.renderer.effect('NAVIGATE', this.event, node, scope, where, {
        trace,
        contextWrites: [...this.contextWrites],
        urls: cleanUrls(this.evaluator.strings(target, scope)),
        entryUrls: this.evaluator.strings(target, scope),
        expression: text(scope.module, node).slice(0, 400),
        fullPage: true,
      }),
    );
  }

  methodOf(options, scope) {
    if (!options) return 'GET';
    const value = this.evaluator.property(this.evaluator.evaluate(options, scope), 'method');
    if (value.t === 'lit')
      return value.v === undefined || value.v === null ? 'GET' : String(value.v).toUpperCase();
    return null;
  }

  request(node, urlExpr, method, scope, where, extra) {
    const candidates = urlExpr ? this.evaluator.strings(urlExpr, scope) : [];
    // A relative URL resolves against the page, which for a routed screen is its route: api/x from /groups is /api/x.
    const relative = candidates.filter(isRelativeUrl);
    const urls = cleanUrls(
      candidates.map((candidate) =>
        isRelativeUrl(candidate)
          ? (resolveAgainstRoute(candidate, this.renderer.routePath) ?? candidate)
          : candidate,
      ),
    );
    const status =
      urls.length === 0 || method === null
        ? 'UNRESOLVED'
        : relative.length || urls.some((url) => url.includes('{'))
          ? 'INFERRED'
          : 'CONFIRMED';
    this.effects.push(
      this.renderer.effect('CALL_API', this.event, node, scope, where, {
        ...extra,
        urls,
        method,
        status,
        ...(relative.length ? { relativeUrls: relative } : {}),
        expression: text(scope.module, node).slice(0, 400),
      }),
    );
  }

  /**
   * fetch(`/api/group${group.id ? `/${group.id}` : ''}`, {method: group.id ? 'PUT' : 'POST'}): when the method is a
   * ternary whose test also chooses part of the URL, each branch is one request under that branch's guard.
   */
  pairedRequest(node, urlExpr, options, scope, where, extra) {
    if (!urlExpr || !options) return false;
    const config = this.evaluator.evaluate(options, scope);
    const property =
      config.t === 'object'
        ? config.node.properties.find(
            (p) => p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === 'method',
          )
        : null;
    const choice = property ? unwrap(property.value) : null;
    if (choice?.type !== 'ConditionalExpression') return false;
    const test = conditionText(config.scope.module, choice.test);
    if (!conditionsIn(urlExpr).some((item) => conditionText(scope.module, item.test) === test))
      return false;
    const testText = text(config.scope.module, choice.test);
    for (const [outcome, branch, guard] of [
      [true, choice.consequent, testText],
      [false, choice.alternate, `!(${testText})`],
    ]) {
      const value = this.evaluator.evaluate(branch, config.scope);
      const method =
        value.t === 'lit' && value.v !== undefined && value.v !== null
          ? String(value.v).toUpperCase()
          : null;
      this.evaluator.assumptions = new Map([[test, outcome]]);
      try {
        this.request(
          node,
          urlExpr,
          method,
          scope,
          { ...where, guards: [...where.guards, guard] },
          extra,
        );
      } finally {
        this.evaluator.assumptions = null;
      }
    }
    return true;
  }
}

export { EffectRunner };
