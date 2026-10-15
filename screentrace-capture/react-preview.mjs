import path from 'node:path';
import {createDirectoryWithin, readBufferLimited, readUtf8Limited, resolveExistingFileWithin, writeBufferWithin} from './safe-files.mjs';

const MAX_CSS_BYTES = 8 * 1024 * 1024;
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const ASSET_DIRECTORY = 'assets/react';

/**
 * Static documents for React screens. The markup comes from the AST reconstruction (already escaped and
 * free of scripts); this step only adds the project's own stylesheets and the local files they reference.
 */
export async function prepareReactPreview({projectRoot, output, htmlRoot}) {
  const file = path.join(htmlRoot, 'react-preview.json');
  let data;
  try { data = JSON.parse(await readUtf8Limited(output, file, 256 * 1024 * 1024)); }
  catch { return null; }
  const diagnostics = [], links = [];
  for (const sheet of data.stylesheets ?? []) {
    const copied = await copyStylesheet(projectRoot, output, htmlRoot, sheet.candidates ?? []);
    if (copied) links.push(copied);
    else diagnostics.push({code: 'REACT_STYLESHEET_MISSING', message: `樣式表 ${sheet.specifier} 不在專案內（套件樣式需先安裝 node_modules）`, source: {file: sheet.from, line: sheet.line}});
  }
  const head = '<meta charset="utf-8">' + links.map(href => `<link rel="stylesheet" href="${href}">`).join('');
  return {
    diagnostics,
    assets: links.map(href => '/' + href),
    document(screenId) {
      const markup = data.screens?.[screenId];
      return typeof markup === 'string' ? `<!doctype html><html><head>${head}</head><body><div id="root">${markup}</div></body></html>` : null;
    }
  };
}

async function copyStylesheet(projectRoot, output, htmlRoot, candidates) {
  for (const candidate of candidates) {
    const relative = safeRelative(candidate);
    if (!relative) continue;
    let source;
    try { source = await resolveExistingFileWithin(projectRoot, path.join(projectRoot, relative)); }
    catch { continue; }
    const css = await readUtf8Limited(projectRoot, source, MAX_CSS_BYTES);
    await write(output, path.join(htmlRoot, ASSET_DIRECTORY, relative), Buffer.from(css));
    for (const reference of localReferences(css)) {
      const target = safeRelative(path.posix.join(path.posix.dirname(relative), reference));
      if (!target) continue;
      try {
        const asset = await resolveExistingFileWithin(projectRoot, path.join(projectRoot, target));
        await write(output, path.join(htmlRoot, ASSET_DIRECTORY, target), await readBufferLimited(projectRoot, asset, MAX_ASSET_BYTES));
      } catch { /* A missing font or image leaves that url() unresolved; pack-preview reports it. */ }
    }
    return `${ASSET_DIRECTORY}/${relative}`;
  }
  return null;
}

/** Relative `url()` targets of a stylesheet, without query or fragment. */
export function localReferences(css) {
  const result = new Set();
  for (const match of css.matchAll(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi)) {
    const value = match[2].trim().split(/[?#]/)[0];
    if (value && !/^(data:|https?:|\/\/|\/|#)/i.test(value)) result.add(value);
  }
  return [...result].sort();
}

async function write(output, file, content) {
  await createDirectoryWithin(output, path.dirname(file));
  await writeBufferWithin(output, file, content);
}

function safeRelative(candidate) {
  const normalized = path.posix.normalize(String(candidate).replaceAll('\\', '/'));
  return normalized && !normalized.startsWith('..') && !path.posix.isAbsolute(normalized) && !normalized.includes('\0') ? normalized : null;
}
