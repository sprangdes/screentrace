import {declared, patternNames, resolveExport, resolveModuleName, resolveSpecifier, FUNCTIONS} from './modules.mjs';

/** A condition's source text with whitespace removed, so the same test written twice compares equal. */
export function conditionText(module, node) {
  return node ? module.code.slice(node.start, node.end).replace(/\s+/g, '') : '';
}

/**
 * Static evaluation over Babel ASTs. Nothing from the target project is executed: values are literals,
 * references to AST nodes with the scope they close over, or UNKNOWN with a name hint for placeholders.
 */
export const UNKNOWN = Object.freeze({t: 'unknown'});
const unknown = hint => hint ? {t: 'unknown', hint} : UNKNOWN;
const lit = v => ({t: 'lit', v});
const MAX_ALTERNATIVES = 8;
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion', 'ParenthesizedExpression', 'TypeCastExpression', 'TSInstantiationExpression']);

export function unwrap(node) {
  while (node && WRAPPERS.has(node.type)) node = node.expression;
  return node;
}

export class Evaluator {
  constructor(modules, maxDepth = 24) {
    this.modules = modules;
    this.maxDepth = maxDepth;
    this.moduleScopes = new Map();
    this.active = new Set();
    /** Condition text → assumed outcome, set while one branch of a request is enumerated. */
    this.assumptions = null;
  }

  moduleScope(file) {
    if (!this.moduleScopes.has(file)) this.moduleScopes.set(file, {module: this.modules.get(file), fn: null, bindings: new Map(), locals: null, parent: null, depth: 0});
    return this.moduleScopes.get(file);
  }

  /** A scope for one invocation of `fn`; `args` are closures ({expr, scope}) or values, matched to parameters. */
  functionScope(fn, closure, args = [], depth = 0) {
    const scope = {module: closure.module, fn, bindings: new Map(), locals: null, parent: closure, depth};
    fn.params.forEach((param, index) => {
      const target = param.type === 'TSParameterProperty' ? param.parameter : param;
      if (target.type === 'RestElement') return;
      this.bindPattern(scope, target, args[index] ?? {value: lit(undefined)});
    });
    return scope;
  }

  bindPattern(scope, pattern, argument) {
    if (pattern.type === 'Identifier') { scope.bindings.set(pattern.name, argument); return; }
    if (pattern.type === 'AssignmentPattern') {
      const value = this.argumentValue(argument);
      const missing = value.t === 'lit' && value.v === undefined;
      this.bindPattern(scope, pattern.left, missing ? {expr: pattern.right, scope} : argument);
      return;
    }
    for (const [name, steps] of patternNames(pattern)) scope.bindings.set(name, {value: this.project(this.argumentValue(argument), steps, scope), from: argument});
  }

  argumentValue(argument) {
    if (!argument) return lit(undefined);
    if (argument.value) return argument.value;
    return this.evaluate(argument.expr, argument.scope);
  }

  /** Locals of a function body, collected without descending into nested functions. */
  locals(scope) {
    if (scope.locals) return scope.locals;
    scope.locals = new Map();
    const body = scope.fn?.body;
    if (!body || body.type !== 'BlockStatement') return scope.locals;
    const visit = node => {
      if (!node?.type) return;
      if (node.type === 'FunctionDeclaration') { if (node.id) scope.locals.set(node.id.name, {node, kind: 'declaration'}); return; }
      if (FUNCTIONS.has(node.type) || node.type === 'ClassExpression') return;
      if (node.type === 'VariableDeclaration') for (const [name, entry] of declared(node)) scope.locals.set(name, entry);
      for (const key of ['body', 'consequent', 'alternate', 'block', 'handler', 'finalizer', 'cases', 'declarations', 'init', 'left'])
        if (Array.isArray(node[key])) node[key].forEach(visit); else if (node[key]?.type) visit(node[key]);
    };
    body.body.forEach(visit);
    return scope.locals;
  }

  /** The binding for `name` visible from `scope`: {binding, scope} for parameters, {entry, scope} for declarations. */
  lookup(name, scope) {
    for (let current = scope; current; current = current.parent) {
      if (current.bindings.has(name)) return {binding: current.bindings.get(name), scope: current};
      if (current.fn) {
        const entry = this.locals(current).get(name);
        if (entry) return {entry, scope: current};
      } else {
        const found = resolveModuleName(this.modules, current.module.file, name);
        if (found?.kind === 'local') return {entry: found.entry, scope: this.moduleScope(found.file)};
        if (found) return {external: found};
        return null;
      }
    }
    return null;
  }

  resolveName(name, scope) {
    const found = this.lookup(name, scope);
    if (!found) return unknown(name);
    if (found.binding) return this.argumentValue(found.binding);
    if (found.external) return this.externalValue(found.external);
    return this.entryValue(found.entry, found.scope, name);
  }

  externalValue(found) {
    if (found.kind === 'namespace') return {t: 'namespace', file: found.file};
    return {t: 'external', specifier: found.specifier, name: found.imported, path: []};
  }

  entryValue(entry, scope, hint) {
    const node = entry.node;
    if (entry.kind === 'declaration') return node.type === 'FunctionDeclaration' ? {t: 'fn', node, scope, name: node.id?.name} : unknown(hint);
    if (entry.kind !== 'variable' || !node.init) return unknown(hint);
    const key = node;
    if (this.active.has(key)) return unknown(hint);
    this.active.add(key);
    try {
      const value = this.evaluate(node.init, scope);
      if (value.t === 'fn' && !value.name) value.name = hint;
      return this.project(value, entry.steps ?? [], scope);
    } finally { this.active.delete(key); }
  }

  project(value, steps, scope) {
    for (const step of steps) {
      if (step.key !== undefined) value = step.key === null ? unknown() : this.property(value, step.key);
      else if (step.index !== undefined) value = this.element(value, step.index);
      else if (step.default) { if (value.t === 'lit' && value.v === undefined) value = this.evaluate(step.default, scope); }
      else if (step.rest) value = unknown();
    }
    return value;
  }

  element(value, index) {
    if (value.t === 'array') {
      const item = value.node.elements[index];
      return item && item.type !== 'SpreadElement' ? this.evaluate(item, value.scope) : unknown();
    }
    if (value.t === 'state') return index === 1 ? {t: 'setter'} : unknown();
    return unknown();
  }

  property(value, key) {
    switch (value.t) {
      case 'router-location': return key==='pathname'&&this.routePath!=null?{...lit(this.routePath),routerPathname:true}:unknown(String(key));
      case 'object': {
        const properties = value.node.properties;
        for (let i = properties.length - 1; i >= 0; i--) {
          const property = properties[i];
          if (property.type === 'SpreadElement') {
            const spread = this.property(this.evaluate(property.argument, value.scope), key);
            if (!(spread.t === 'lit' && spread.v === undefined)) return spread;
            continue;
          }
          if (property.computed) {
            const computed = this.evaluate(property.key, value.scope);
            if (computed.t !== 'lit') return unknown(String(key));
            if (String(computed.v) !== String(key)) continue;
          } else if ((property.key.name ?? String(property.key.value)) !== String(key)) continue;
          if (property.type === 'ObjectMethod') return {t: 'fn', node: property, scope: value.scope, name: String(key)};
          return this.named(this.evaluate(property.value, value.scope), String(key));
        }
        return lit(undefined);
      }
      case 'props': {
        if (key === 'children') return value.children ? {t: 'children', closure: value.children} : lit(undefined);
        if (value.attrs.has(key)) return this.named(this.argumentValue(value.attrs.get(key)), key);
        return value.spread ? unknown(key) : lit(undefined);
      }
      case 'namespace': {
        const found = resolveExport(this.modules, value.file, key);
        if (found?.kind === 'local') return this.entryValue(found.entry, this.moduleScope(found.file), key);
        return found ? this.externalValue(found) : unknown(key);
      }
      case 'external': return {...value, path: [...value.path, key]};
      case 'array': return typeof key === 'number' || /^\d+$/.test(String(key)) ? this.element(value, Number(key)) : unknown(String(key));
      case 'demo-response': return key === 'length' ? lit(1) : {t:'demo-value'};
      case 'demo-value': return key === 'length' ? lit(1) : {t:'demo-value'};
      case 'demo-array': return key === 'length' ? lit(1) : unknown(String(key));
      default: return unknown(String(key));
    }
  }

  named(value, name) {
    return value.t === 'fn' && !value.name ? {...value, name} : value;
  }

  evaluate(expr, scope, depth = scope?.depth ?? 0) {
    const node = unwrap(expr);
    if (!node) return lit(undefined);
    switch (node.type) {
      case 'StringLiteral': case 'NumericLiteral': case 'BooleanLiteral': return lit(node.value);
      case 'NullLiteral': return lit(null);
      case 'Identifier': return node.name === 'undefined' ? lit(undefined) : this.resolveName(node.name, scope);
      case 'TemplateLiteral': {
        let out = '';
        for (let i = 0; i < node.quasis.length; i++) {
          out += node.quasis[i].value.cooked ?? '';
          if (i < node.expressions.length) {
            const part = this.evaluate(node.expressions[i], scope);
            if (!printable(part)||part.routerPathname) return unknown();
            out += String(part.v);
          }
        }
        return lit(out);
      }
      case 'ObjectExpression': return {t: 'object', node, scope};
      case 'ArrayExpression': return {t: 'array', node, scope};
      case 'ArrowFunctionExpression': case 'FunctionExpression': return {t: 'fn', node, scope, name: node.id?.name};
      case 'JSXElement': case 'JSXFragment': return {t: 'jsx', node, scope};
      case 'MemberExpression': case 'OptionalMemberExpression': {
        const object = this.evaluate(node.object, scope);
        if (!node.computed) return this.property(object, node.property.name);
        const key = this.evaluate(node.property, scope);
        return key.t === 'lit' ? this.property(object, key.v) : unknown();
      }
      case 'UnaryExpression': {
        const argument = this.evaluate(node.argument, scope);
        if (node.operator === 'void') return lit(undefined);
        if (node.operator === '!') { const truth = truthy(argument); return truth === null ? unknown() : lit(!truth); }
        if (argument.t !== 'lit') return unknown();
        if (node.operator === '-') return lit(-argument.v);
        if (node.operator === 'typeof') return lit(typeof argument.v);
        return unknown();
      }
      case 'BinaryExpression': {
        const left = this.evaluate(node.left, scope), right = this.evaluate(node.right, scope);
        if (left.t !== 'lit' || right.t !== 'lit') return unknown();
        switch (node.operator) {
          case '===': return lit(left.v === right.v);
          case '!==': return lit(left.v !== right.v);
          case '==': return lit(left.v == right.v); // eslint-disable-line eqeqeq
          case '!=': return lit(left.v != right.v); // eslint-disable-line eqeqeq
          case '+': if(left.routerPathname||right.routerPathname)return unknown();return (typeof left.v === 'string' || typeof right.v === 'string') && !(printable(left) && printable(right)) ? unknown() : lit(left.v + right.v);
          case '<': return lit(left.v < right.v);
          case '>': return lit(left.v > right.v);
          case '<=': return lit(left.v <= right.v);
          case '>=': return lit(left.v >= right.v);
          default: return unknown();
        }
      }
      case 'LogicalExpression': {
        const left = this.evaluate(node.left, scope), truth = truthy(left);
        if (node.operator === '??') {
          if (left.t === 'lit') return left.v === null || left.v === undefined ? this.evaluate(node.right, scope) : left;
          return left.t === 'unknown' ? unknown() : left;
        }
        if (truth === null) return unknown();
        if (node.operator === '&&') return truth ? this.evaluate(node.right, scope) : left;
        return truth ? left : this.evaluate(node.right, scope);
      }
      case 'ConditionalExpression': {
        const truth = truthy(this.evaluate(node.test, scope));
        if (truth === null) return unknown();
        return this.evaluate(truth ? node.consequent : node.alternate, scope);
      }
      case 'CallExpression': case 'OptionalCallExpression': return this.call(node, scope, depth);
      case 'ImportExpression': return unknown();
      default: return unknown();
    }
  }

  /** The value a call produces, for the hooks and wrappers that matter to rendering and URLs. */
  call(node, scope, depth) {
    const member = unwrap(node.callee);
    if(member.type==='MemberExpression'&&!member.computed&&member.object.type==='Identifier'&&member.object.name==='Object'&&!this.lookup('Object',scope)&&member.property.name==='keys'&&node.arguments.length===1){const object=this.evaluate(node.arguments[0],scope);if(object.t==='object')return {t:'object-keys',object};}
    if(member.type==='MemberExpression'&&!member.computed&&member.property.name==='includes'&&node.arguments.length===1){const array=this.evaluate(member.object,scope),argument=this.evaluate(node.arguments[0],scope);if(array.t==='array'&&argument.t==='lit'&&array.node.elements.every(e=>e&&['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(unwrap(e).type))){return lit(array.node.elements.some(e=>(unwrap(e).type==='NullLiteral'?null:e.value)===argument.v));}}
    if ((member.type === 'MemberExpression' || member.type === 'OptionalMemberExpression') && !member.computed && member.property.name === 'filter') {
      const filtered = this.filter(this.evaluate(member.object, scope), node.arguments[0] && this.evaluate(node.arguments[0], scope), depth);
      if (filtered) return filtered;
    }
    const callee = this.evaluate(node.callee, scope);
    const args = node.arguments.map(expr => ({expr, scope}));
    if (callee.t === 'external') {
      const name = externalName(callee);
      if(name==='useLocation'&&['react-router','react-router-dom','react-router-native'].includes(callee.specifier))return {t:'router-location'};
      if (name === 'useNavigate') return {t: 'navigate'};
      if (name === 'useCallback') return args[0] ? this.argumentValue(args[0]) : unknown();
      if (name === 'useMemo') { const fn = args[0] ? this.argumentValue(args[0]) : unknown(); return fn.t === 'fn' ? this.result(fn, [], depth) : unknown(); }
      if (name === 'useState' || name === 'useReducer') return {t: 'state'};
      if (name === 'memo' || name === 'forwardRef') return args[0] ? this.argumentValue(args[0]) : unknown();
      if (name === 'lazy') return this.lazyComponent(node.arguments[0], scope);
      return unknown();
    }
    if (callee.t === 'fn') return this.result(callee, args, depth);
    return unknown();
  }

  /** `items.filter(fn)` over a literal array: items the predicate proves false are dropped, unproven ones kept. */
  filter(items, fn, depth) {
    if (items?.t !== 'array' || fn?.t !== 'fn' || items.node.elements.some(item => !item || item.type === 'SpreadElement')) return null;
    const kept = items.node.elements.filter((item, index) => truthy(this.result(fn, [{expr: item, scope: items.scope}, {value: lit(index)}], depth)) !== false);
    return {t: 'array', node: {type: 'ArrayExpression', elements: kept}, scope: items.scope};
  }

  lazyComponent(factory, scope) {
    const body = factory && FUNCTIONS.has(factory.type) ? unwrap(factory.body.type === 'BlockStatement' ? factory.body.body.find(s => s.type === 'ReturnStatement')?.argument : factory.body) : null;
    const target = body?.type === 'CallExpression' && body.callee.type === 'Import' ? body.arguments[0] : body?.type === 'ImportExpression' ? body.source : null;
    if (target?.type !== 'StringLiteral') return unknown();
    const file = resolveSpecifier(scope.module.file, target.value, this.modules);
    return file ? this.property({t: 'namespace', file}, 'default') : unknown();
  }

  /** The value returned by `fn`; block bodies use their final top-level return. */
  result(fn, args, depth) {
    if (depth >= this.maxDepth || this.active.has(fn.node)) return unknown();
    this.active.add(fn.node);
    try {
      const scope = this.functionScope(fn.node, fn.scope, args, depth + 1);
      const returned = returnedExpressions(fn.node);
      return returned.length === 1 ? this.evaluate(returned[0], scope, depth + 1) : unknown();
    } finally { this.active.delete(fn.node); }
  }

  /** Candidate string values, keeping `{name}` placeholders for parts that cannot be proven. */
  strings(expr, scope, depth = 0) {
    const node = unwrap(expr);
    if (!node || depth > this.maxDepth) return [placeholder(node)];
    const value = this.evaluate(node, scope, depth);
    if (value.t === 'lit' && value.v !== undefined && value.v !== null && typeof value.v !== 'object') return [String(value.v)];
    switch (node.type) {
      case 'TemplateLiteral': {
        let out = [''];
        for (let i = 0; i < node.quasis.length; i++) {
          out = out.map(prefix => prefix + (node.quasis[i].value.cooked ?? ''));
          if (i < node.expressions.length) out = cross(out, this.strings(node.expressions[i], scope, depth + 1));
        }
        return out;
      }
      case 'BinaryExpression': return node.operator === '+' ? cross(this.strings(node.left, scope, depth + 1), this.strings(node.right, scope, depth + 1)) : [placeholder(node)];
      case 'ConditionalExpression': {
        const assumed = this.assumptions && scope?.module ? this.assumptions.get(conditionText(scope.module, node.test)) : undefined;
        if (assumed !== undefined) return this.strings(assumed ? node.consequent : node.alternate, scope, depth + 1);
        const truth = truthy(this.evaluate(node.test, scope, depth));
        if (truth !== null) return this.strings(truth ? node.consequent : node.alternate, scope, depth + 1);
        return union(this.strings(node.consequent, scope, depth + 1), this.strings(node.alternate, scope, depth + 1));
      }
      case 'LogicalExpression': return union(this.strings(node.left, scope, depth + 1), this.strings(node.right, scope, depth + 1));
      case 'Identifier': {
        const found = this.lookup(node.name, scope);
        if (found?.binding && !found.binding.value) return this.strings(found.binding.expr, found.binding.scope, depth + 1);
        if (found?.binding?.from && !found.binding.from.value && found.binding.value?.t === 'unknown') return [placeholder(node)];
        if (found?.entry?.kind === 'variable' && found.entry.node.init && !(found.entry.steps ?? []).length) return this.strings(found.entry.node.init, found.scope, depth + 1);
        return [placeholder(node)];
      }
      case 'CallExpression': case 'OptionalCallExpression': {
        const name = node.callee.type === 'Identifier' ? node.callee.name : node.callee.property?.name;
        if (['encodeURIComponent', 'encodeURI', 'String', 'toString', 'trim'].includes(name)) {
          const inner = node.callee.type === 'Identifier' ? node.arguments[0] : node.callee.object;
          return inner ? this.strings(inner, scope, depth + 1) : [placeholder(node)];
        }
        const callee = this.evaluate(node.callee, scope, depth);
        if (callee.t === 'fn' && !this.active.has(callee.node)) {
          this.active.add(callee.node);
          try {
            const inner = this.functionScope(callee.node, callee.scope, node.arguments.map(arg => ({expr: arg, scope})), depth + 1);
            const returned = returnedExpressions(callee.node);
            if (returned.length) return returned.map(item => this.strings(item, inner, depth + 1)).reduce(union);
          } finally { this.active.delete(callee.node); }
        }
        return [placeholder(node)];
      }
      default: return [placeholder(node)];
    }
  }
}

export function externalName(value) {
  return [value.name === 'default' || value.name === '*' ? '' : value.name, ...value.path].filter(Boolean).join('.');
}

/** Only these literals may become text; `undefined`/`null` in a URL would be a fabricated value. */
function printable(value) {
  return value.t === 'lit' && ['string', 'number', 'boolean'].includes(typeof value.v);
}

export function truthy(value) {
  if (value.t === 'lit') return Boolean(value.v);
  if (['object', 'array', 'demo-response', 'demo-value', 'demo-array', 'fn', 'jsx', 'navigate'].includes(value.t)) return true;
  return null;
}

export function returnedExpressions(fn) {
  if (fn.body?.type !== 'BlockStatement') return fn.body ? [fn.body] : [];
  const result = [];
  const visit = node => {
    if (!node?.type || FUNCTIONS.has(node.type)) return;
    if (node.type === 'ReturnStatement') { if (node.argument) result.push(node.argument); return; }
    for (const key of ['body', 'consequent', 'alternate', 'block', 'handler', 'finalizer', 'cases'])
      if (Array.isArray(node[key])) node[key].forEach(visit); else if (node[key]?.type) visit(node[key]);
  };
  fn.body.body.forEach(visit);
  return result;
}

function placeholder(node) {
  const n = unwrap(node);
  const name = n?.type === 'Identifier' ? n.name : (n?.type === 'MemberExpression' || n?.type === 'OptionalMemberExpression') && !n.computed ? n.property.name : 'value';
  return `{${name}}`;
}

function cross(left, right) {
  const out = [];
  for (const a of left) for (const b of right) if (out.length < MAX_ALTERNATIVES) out.push(a + b);
  return [...new Set(out)];
}

function union(left, right) {
  return [...new Set([...left, ...right])].slice(0, MAX_ALTERNATIVES);
}
