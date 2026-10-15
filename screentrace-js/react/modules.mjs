import {parse} from '@babel/parser';
import path from 'node:path';

export const PARSER = 'BabelReactAnalyzer';
const EXTENSIONS = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];

export function diagnostic(file, line, code, message) {
  return {code, message, source: {file, line}, parser: PARSER, status: 'UNRESOLVED'};
}

function plugins(file) {
  if (file.endsWith('.ts')) return ['typescript'];
  if (file.endsWith('.tsx')) return ['jsx', 'typescript'];
  return ['jsx'];
}

/** Parses every source once; syntax errors are recovered where Babel can and always reported. */
export function parseModules(files) {
  const modules = new Map(), diagnostics = [];
  for (const {file, code} of [...files].sort((a, b) => a.file.localeCompare(b.file))) {
    let ast = null;
    try {
      ast = parse(code, {sourceType: 'module', plugins: plugins(file), errorRecovery: true, allowReturnOutsideFunction: true});
      for (const error of ast.errors ?? []) diagnostics.push(diagnostic(file, error.loc?.line ?? 1, 'REACT_SYNTAX_ERROR', `原始碼語法錯誤：${error.reasonCode ?? error.message}`));
    } catch (error) {
      diagnostics.push(diagnostic(file, error.loc?.line ?? 1, 'REACT_SYNTAX_ERROR', `原始碼無法解析：${error.message}`));
      continue;
    }
    modules.set(file, {file, code, ast, imports: new Map(), declarations: new Map(), exports: new Map(), reexports: []});
  }
  for (const module of modules.values()) index(module, modules);
  return {modules, diagnostics};
}

export function resolveSpecifier(from, specifier, modules) {
  if (!specifier.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  if (base.startsWith('..')) return null;
  return EXTENSIONS.map(suffix => base + suffix).find(candidate => modules.has(candidate)) ?? null;
}

function index(module, modules) {
  for (const statement of module.ast.program.body) {
    if (statement.type === 'ImportDeclaration') {
      if (statement.importKind === 'type') continue;
      const specifier = statement.source.value, file = resolveSpecifier(module.file, specifier, modules);
      for (const item of statement.specifiers) {
        if (item.importKind === 'type') continue;
        const imported = item.type === 'ImportDefaultSpecifier' ? 'default' : item.type === 'ImportNamespaceSpecifier' ? '*' : item.imported.name ?? item.imported.value;
        module.imports.set(item.local.name, {file, specifier, imported, node: item});
      }
      continue;
    }
    const exported = statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration';
    const declaration = exported ? statement.declaration : statement;
    if (statement.type === 'ExportDefaultDeclaration') {
      if (declaration.type === 'Identifier') module.exports.set('default', declaration.name);
      else {
        const name = declaration.id?.name ?? '*default*';
        module.declarations.set(name, {node: declaration, kind: 'declaration'});
        module.exports.set('default', name);
      }
      continue;
    }
    if (statement.type === 'ExportNamedDeclaration' && statement.source) {
      const file = resolveSpecifier(module.file, statement.source.value, modules);
      for (const item of statement.specifiers) module.reexports.push({exported: item.exported.name ?? item.exported.value, imported: item.local?.name ?? '*', file, specifier: statement.source.value});
      continue;
    }
    if (statement.type === 'ExportAllDeclaration') {
      module.reexports.push({exported: '*', imported: '*', file: resolveSpecifier(module.file, statement.source.value, modules), specifier: statement.source.value});
      continue;
    }
    if (statement.type === 'ExportNamedDeclaration' && !declaration) {
      for (const item of statement.specifiers) module.exports.set(item.exported.name ?? item.exported.value, item.local.name);
      continue;
    }
    if (!declaration) continue;
    for (const [name, entry] of declared(declaration)) {
      module.declarations.set(name, entry);
      if (exported) module.exports.set(name, name);
    }
  }
}

/** Names introduced by one statement, keeping the destructuring path so values can be projected later. */
export function declared(statement) {
  const result = [];
  if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
    if (statement.id) result.push([statement.id.name, {node: statement, kind: 'declaration'}]);
  } else if (statement.type === 'VariableDeclaration') {
    for (const declarator of statement.declarations) for (const [name, steps] of patternNames(declarator.id)) result.push([name, {node: declarator, kind: 'variable', steps}]);
  } else if (statement.type === 'TSEnumDeclaration' && statement.id) {
    result.push([statement.id.name, {node: statement, kind: 'enum'}]);
  }
  return result;
}

/** Each bound name with the property/index steps that lead to it inside a destructuring pattern. */
export function patternNames(pattern, steps = []) {
  if (!pattern) return [];
  switch (pattern.type) {
    case 'Identifier': return [[pattern.name, steps]];
    case 'AssignmentPattern': return patternNames(pattern.left, [...steps, {default: pattern.right}]);
    case 'ObjectPattern': return pattern.properties.flatMap(property => property.type === 'RestElement'
      ? patternNames(property.argument, [...steps, {rest: true}])
      : patternNames(property.value, [...steps, {key: property.computed ? null : property.key.name ?? property.key.value}]));
    case 'ArrayPattern': return pattern.elements.flatMap((element, index) => element ? patternNames(element, [...steps, {index}]) : []);
    case 'RestElement': return patternNames(pattern.argument, [...steps, {rest: true}]);
    case 'TSParameterProperty': return patternNames(pattern.parameter, steps);
    default: return [];
  }
}

/** Follows imports and re-exports to the module-level declaration that defines an exported name. */
export function resolveExport(modules, file, name, seen = new Set()) {
  const module = modules.get(file);
  if (!module || seen.has(file + ':' + name)) return null;
  seen.add(file + ':' + name);
  const local = module.exports.get(name);
  if (local !== undefined) return resolveModuleName(modules, file, local, seen);
  for (const item of module.reexports) {
    if (item.exported === name) return item.file ? (item.imported === '*' ? {kind: 'namespace', file: item.file} : resolveExport(modules, item.file, item.imported, seen)) : {kind: 'external', specifier: item.specifier, imported: item.imported};
  }
  for (const item of module.reexports) {
    if (item.exported === '*' && item.file) {
      const found = resolveExport(modules, item.file, name, seen);
      if (found) return found;
    }
  }
  return null;
}

export function resolveModuleName(modules, file, name, seen = new Set()) {
  const module = modules.get(file);
  if (!module) return null;
  const declaration = module.declarations.get(name);
  if (declaration) return {kind: 'local', file, name, entry: declaration};
  const imported = module.imports.get(name);
  if (!imported) return null;
  if (!imported.file) return {kind: 'external', specifier: imported.specifier, imported: imported.imported};
  if (imported.imported === '*') return {kind: 'namespace', file: imported.file};
  return resolveExport(modules, imported.file, imported.imported, seen);
}

export function line(node) {
  return node?.loc?.start.line ?? 1;
}

export function text(module, node) {
  return node ? module.code.slice(node.start, node.end) : '';
}

const SKIP = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'typeAnnotation', 'returnType', 'typeParameters', 'typeArguments']);
export function children(node) {
  const result = [];
  for (const [key, value] of Object.entries(node)) {
    if (SKIP.has(key) || !value || typeof value !== 'object') continue;
    if (Array.isArray(value)) { for (const item of value) if (item?.type) result.push(item); }
    else if (value.type) result.push(value);
  }
  return result;
}

export const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod']);
