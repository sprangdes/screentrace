import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

async function exists(directory) {
  try { await access(directory, constants.R_OK); return true; } catch { return false; }
}

function attributes(source) {
  const values = {};
  for (const match of source.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) values[match[1]] = match[3];
  return values;
}

async function files(root) {
  if (!(await exists(root))) return [];
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const item = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await files(item));
    else if (entry.isFile() && entry.name.endsWith('.xml')) result.push(item);
  }
  return result;
}

function mappingPrefix(mapping) {
  const value = mapping.replace(/\/\*\*.*$/, '').replace(/^\/+|\/+$/g, '');
  return value ? `/${value}/` : null;
}

function sourceDirectory(target, webRoot, location) {
  const value = location.trim();
  if (value.startsWith('classpath:')) return path.resolve(target, 'src/main/resources', value.substring('classpath:'.length).replace(/^\/+/, ''));
  if (value.startsWith('/')) return path.resolve(webRoot, value.substring(1));
  return path.resolve(webRoot, value);
}

function within(root, candidate) {
  const normalizedRoot = path.resolve(root);
  const normalizedCandidate = path.resolve(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(normalizedRoot + path.sep);
}

/** Discovers servlet-webapp and classpath locations exposed by Spring MVC resource mappings. */
export async function discoverSpringResourceMappings(target, webRoot, readFile) {
  const mappings = [];
  for (const file of await files(path.join(target, 'src/main'))) {
    const xml = await readFile(file, 'utf8');
    for (const tag of xml.matchAll(/<mvc:resources\b([^>]*?)\/?>/gi)) {
      const values = attributes(tag[1]);
      const prefix = values.mapping && mappingPrefix(values.mapping);
      if (!prefix || !values.location) continue;
      for (const location of values.location.split(',')) {
        const sourceDir = sourceDirectory(target, webRoot, location);
        if (!within(target, sourceDir)) continue;
        mappings.push({ urlPrefix: prefix, assetKey: prefix.slice(1, -1), sourceDir });
      }
    }
  }
  return mappings;
}

export function deduplicateMappings(mappings) {
  const seen = new Set();
  return mappings.filter(mapping => {
    const key = `${path.resolve(mapping.sourceDir)}\0${mapping.assetKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
