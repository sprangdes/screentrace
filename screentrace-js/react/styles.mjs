import path from 'node:path';

/**
 * Stylesheets the bundle would load, in import order from the entry module: side-effect `.css` imports,
 * as project-relative candidate paths. Bare package imports list each ancestor `node_modules` candidate;
 * the capture step uses the first one that exists and reports the rest as missing.
 */
export function stylesheets(modules, entries) {
  const result = [], seen = new Set(), visited = new Set();
  const visit = file => {
    const module = modules.get(file);
    if (!module || visited.has(file)) return;
    visited.add(file);
    for (const statement of module.ast.program.body) {
      if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
      const specifier = statement.source.value;
      if (/\.css$/i.test(specifier) && !/\.module\.css$/i.test(specifier)) {
        if (statement.specifiers.length) continue;
        const candidates = cssCandidates(file, specifier);
        const key = candidates.join('|');
        if (candidates.length && !seen.has(key)) {
          seen.add(key);
          result.push({specifier, ...(packageName(specifier)?{package: packageName(specifier)}:{}), from: file, line: statement.loc?.start.line ?? 1, candidates});
        }
        continue;
      }
      const target = module.imports.size ? [...module.imports.values()].find(item => item.node && statement.specifiers.includes(item.node))?.file : null;
      if (target) visit(target);
      else if (specifier.startsWith('.')) visit(resolveRelative(modules, file, specifier));
    }
  };
  entries.forEach(visit);
  return result;
}

function packageName(specifier){if(specifier.startsWith('.')||specifier.startsWith('/')||/^[a-z]+:/i.test(specifier))return null;const parts=specifier.split('/');return specifier.startsWith('@')?parts.slice(0,2).join('/'):parts[0];}

function cssCandidates(from, specifier) {
  if (specifier.startsWith('.')) {
    const joined = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    return joined.startsWith('..') ? [] : [joined];
  }
  if (specifier.startsWith('/') || /^[a-z]+:/i.test(specifier)) return [];
  const candidates = [];
  for (let directory = path.posix.dirname(from); ; directory = path.posix.dirname(directory)) {
    candidates.push(path.posix.normalize(path.posix.join(directory === '.' ? '' : directory, 'node_modules', specifier)));
    if (directory === '.' || directory === '/' || directory === '') break;
  }
  return candidates.filter(candidate => !candidate.startsWith('..'));
}

function resolveRelative(modules, from, specifier) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  return ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'].map(suffix => base + suffix).find(file => modules.has(file)) ?? null;
}
