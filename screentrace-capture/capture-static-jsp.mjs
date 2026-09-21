import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [targetArg, outputArg] = process.argv.slice(2);
if (!targetArg) throw new Error('Usage: capture-static-jsp.mjs <target-project> [output-directory]');
const target = path.resolve(targetArg);
const output = path.resolve(outputArg || path.join(target, '.screentrace'));
const graph = JSON.parse(await readFile(path.join(output, 'application-graph.json'), 'utf8'));
const endpointByPath = new Map(graph.nodes.filter(node => node.type === 'ENDPOINT').map(node => [node.attributes?.path, node]));
const handlerByEndpoint = new Map(graph.relationships.filter(edge => edge.type === 'HANDLED_BY').map(edge => [edge.from, edge.to]));
const screenByHandler = new Map(graph.relationships.filter(edge => edge.type === 'RENDERS').map(edge => [edge.from, edge.to]));
const webRoot = path.join(target, 'src/main/webapp');
const tagRoot = path.join(webRoot, 'WEB-INF/tags');
const htmlRoot = path.join(output, 'static-preview');
const screenshotRoot = path.join(output, 'screenshots');
await mkdir(htmlRoot, { recursive: true });
await mkdir(screenshotRoot, { recursive: true });

async function exists(file) { try { await access(file, constants.R_OK); return true; } catch { return false; } }
async function text(file) { return readFile(file, 'utf8'); }
const assetRoots = [
  [path.join(webRoot, 'resources'), 'resources'], [path.join(webRoot, 'css'), 'css'],
  [path.join(webRoot, 'js'), 'js'], [path.join(webRoot, 'images'), 'images'],
  [path.join(target, 'src/main/resources/static'), ''], [path.join(target, 'src/main/resources/public'), '']
];
async function copyAssets() {
  for (const [source, previewPath] of assetRoots) if (await exists(source)) {
    await cp(source, path.join(htmlRoot, 'assets', previewPath), { recursive: true });
    await rewriteCssUrls(path.join(htmlRoot, 'assets', previewPath));
  }
}
async function rewriteCssUrls(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await rewriteCssUrls(file);
    else if (entry.isFile() && entry.name.endsWith('.css')) await writeFile(file,
      (await text(file)).replace(/url\(\s*(["']?)\/(resources|css|js|images)\/([^)'"\s]+)(\1)\s*\)/g,
        (_, quote, folder, resource, closingQuote) => `url(${quote}${path.relative(path.dirname(file), path.join(htmlRoot, 'assets', folder, resource)).replaceAll(path.sep, '/')}${closingQuote})`));
  }
}
await copyAssets();
function attrs(source) {
  const values = {};
  for (const match of source.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) values[match[1]] = match[3];
  return values;
}
function removeDirectives(source) { return source.replace(/<%@[^%]*%>/g, '').replace(/<%--[\s\S]*?--%>/g, ''); }
async function expandIncludes(source, currentFile, stack = new Set(), depth = 0) {
  if (depth >= 16) return source;
  return replaceAsync(source, /<%@\s*include\s+file\s*=\s*(["'])(.*?)\1\s*%>/gi, async match => {
    const includePath = match[2];
    const file = includePath.startsWith('/') ? path.join(webRoot, includePath) : path.resolve(path.dirname(currentFile), includePath);
    if (stack.has(file) || !(await exists(file))) return '';
    const next = new Set(stack); next.add(file);
    return expandIncludes(await text(file), file, next, depth + 1);
  });
}
function placeholder(expression) {
  const value = expression.trim();
  const escaped = value.match(/^fn:escapeXml\((.+)\)$/);
  if (escaped) return placeholder(escaped[1]);
  if (value.includes('pageContext')) return '';
  if (/\.id$/.test(value)) return '1';
  if (/\.(firstName|givenName)$/.test(value)) return 'Alex';
  if (/\.lastName$/.test(value)) return 'Johnson';
  if (/\.(address|street)$/.test(value)) return '123 Sample Street';
  if (/\.(city|town)$/.test(value)) return 'Taipei';
  if (/\.(telephone|phone|mobile)$/.test(value)) return '02-5555-0101';
  if (/\.(birthDate|date)$/.test(value)) return '2020-05-12';
  if (/\.(description|message|note)$/.test(value)) return 'Routine check-up';
  if (/\.type\.name$/.test(value)) return 'Dog';
  if (/\.(name|title)$/.test(value)) return /owner/.test(value) ? 'Alex Johnson' : 'Buddy';
  if (/errorMessage/.test(value)) return 'Validation message';
  return value.split(/[.[' ]/)[0].replace(/^./, c => c.toUpperCase()) || 'Sample value';
}
function replaceExpressions(source, values = {}) {
  return source.replace(/\$\{([^}]+)\}/g, (_, expression) => {
    const value = expression.trim(), escaped = value.match(/^fn:escapeXml\((.+)\)$/)?.[1];
    return values[value] ?? (escaped ? values[escaped] ?? placeholder(escaped) : placeholder(value));
  });
}
async function expandTag(name, attributeText, body, slots, depth) {
  if (depth > 12) return body;
  const file = path.join(tagRoot, `${name}.tag`);
  if (!(await exists(file))) return body || '';
  const values = attrs(attributeText);
  let template = removeDirectives(await text(file));
  template = replaceExpressions(template, values);
  template = template.replace(/<jsp:doBody\s*\/>/g, body || '');
  template = template.replace(/<jsp:invoke\s+fragment=["']customScript["']\s*\/>/g, slots.customScript || '');
  return expandTags(template, slots, depth + 1);
}
async function expandTags(source, slots = {}, depth = 0) {
  // Expand paired tags before self-closing tags so jsp:body content remains available to layout.tag.
  const paired = /<petclinic:([\w-]+)\b([^>]*)>([\s\S]*?)<\/petclinic:\1\s*>/g;
  let result = '', cursor = 0;
  for (const match of source.matchAll(paired)) {
    result += source.slice(cursor, match.index);
    result += await expandTag(match[1], match[2], match[3], slots, depth);
    cursor = match.index + match[0].length;
  }
  result += source.slice(cursor);
  const selfClosing = /<petclinic:([\w-]+)\b([^>]*)\/>/g;
  result = await replaceAsync(result, selfClosing, match => expandTag(match[1], match[2], '', slots, depth));
  return result;
}
async function replaceAsync(source, expression, mapper) {
  const matches = [...source.matchAll(expression)];
  const replacements = await Promise.all(matches.map(mapper));
  let result = '', cursor = 0;
  matches.forEach((match, index) => { result += source.slice(cursor, match.index) + replacements[index]; cursor = match.index + match[0].length; });
  return result + source.slice(cursor);
}
function rewriteAssetUrls(source) {
  return source.replace(/\b(href|src)=(['"])\/(resources|css|js|images)\//gi, '$1=$2assets/$3/');
}
function htmlControls(source) {
  return source
    .replace(/<c:url\b[^>]*?\bvalue\s*=\s*(["'])(.*?)\1[^>]*\/>/gi, '$2')
    .replace(/<c:out\b([^>]*)\/>/g, (_, attributeText) => attrs(attributeText).value || attrs(attributeText).default || 'Sample value')
    .replace(/<fmt:formatDate\b([^>]*)\/>/g, (_, attributeText) => attrs(attributeText).value || '2020-05-12')
    .replace(/<spring:url\s+value=["']([^"']+)["'][^>]*\/>/g, '$1')
    .replace(/<form:form\b([^>]*)>/g, '<form$1>').replace(/<\/form:form>/g, '</form>')
    .replace(/<form:input\b([^>]*)\/>/g, '<input$1/>')
    .replace(/<form:password\b([^>]*)\/>/g, '<input type="password"$1/>')
    .replace(/<form:textarea\b([^>]*)\/>/g, '<textarea$1></textarea>')
    .replace(/<form:select\b([^>]*)\/>/g, '<select$1><option>Sample option</option><option>Sample option 2</option></select>')
    .replace(/\bpath=/g, 'name=')
    .replace(/<c:(?:if|when|otherwise|choose|out|set|forEach|remove)[^>]*>/g, '')
    .replace(/<\/c:(?:if|when|otherwise|choose|out|set|forEach|remove)>/g, '')
    .replace(/<spring:(?:bind|message)[^>]*>/g, '').replace(/<\/spring:(?:bind|message)>/g, '')
    .replace(/<jsp:(?:body|attribute)[^>]*>/g, '').replace(/<\/jsp:(?:body|attribute)>/g, '')
    .replace(/<script(?![^>]*\bsrc\s*=)[\s\S]*?<\/script>/gi, '')
    .replace(/\s+(?:items|modelAttribute|names)=["'][^"']*["']/g, '');
}
function dynamicExpressions(source) { return [...source.matchAll(/\$\{[^}]+}/g)].map(match => match[0]); }
async function renderJsp(screen) {
  const view = screen.attributes?.view;
  if (!view || !view.endsWith('.jsp')) return null;
  const jsp = path.join(target, view);
  if (!(await exists(jsp))) return null;
  let source = await expandIncludes(await text(jsp), jsp, new Set([jsp]));
  source = removeDirectives(source);
  const unresolved = dynamicExpressions(source);
  const custom = source.match(/<jsp:attribute\s+name=["']customScript["'][^>]*>([\s\S]*?)<\/jsp:attribute>/)?.[1] || '';
  source = source.replace(/<jsp:attribute\s+name=["']customScript["'][^>]*>[\s\S]*?<\/jsp:attribute>/g, '');
  source = await expandTags(source, { customScript: custom });
  const urls = {};
  source = source.replace(/<spring:url\b([^>]*?)\/>/g, (_, attributeText) => {
    const attributes = attrs(attributeText);
    if (attributes.var && attributes.value) {
      urls[attributes.var] = attributes.value.replace(/\{[^}]+\}/g, '1');
      return '';
    }
    return attributes.value || '';
  });
  source = source.replace(/<spring:url\b([^>]*)>([\s\S]*?)<\/spring:url>/g, (_, attributeText) => {
    const attributes = attrs(attributeText), value = attributes.value;
    if (attributes.var && value) urls[attributes.var] = value.replace(/\{[^}]+\}/g, '1');
    return '';
  });
  source = rewriteAssetUrls(htmlControls(replaceExpressions(source, urls)));
  if (!/<html[\s>]/i.test(source)) source = `<!doctype html><html><head></head><body>${source}</body></html>`;
  source = source.replace(/<html\b[^>]*>\s*<html\b[^>]*>/gi, '<html>').replace(/<\/head>\s*<head\b[^>]*>/gi, '');
  const htmlFile = path.join(htmlRoot, `${screen.id}.html`);
  await writeFile(htmlFile, source);
  return { htmlFile, assets: [...source.matchAll(/\b(?:href|src)=["'](assets\/[^"']+)/gi)].map(match => '/' + match[1]), dynamicExpressions: unresolved };
}

const manifest = {}, screenshots = {}, interactions = {}, reconstruction = {};
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
for (const screen of graph.nodes.filter(node => node.type === 'SCREEN')) {
  const rendered = await renderJsp(screen);
  if (!rendered) continue;
  manifest[screen.id] = `static-preview/${path.basename(rendered.htmlFile)}`;
  reconstruction[screen.id] = { view: screen.attributes?.view, assets: rendered.assets, dynamicExpressions: rendered.dynamicExpressions, rendering: { mode: 'reconstructed' } };
  await page.goto(pathToFileURL(rendered.htmlFile).href, { waitUntil: 'load' });
  const items = await page.locator('a[href], button, input[type="submit"], input[type="button"], form[action]').evaluateAll(items => items.map((item, index) => {
    const box = item.getBoundingClientRect(), style = getComputedStyle(item);
    const form = item.tagName === 'FORM' ? item : item.closest('form');
    const target = item.getAttribute('href') || item.getAttribute('formaction') || form?.getAttribute('action') || null;
    const css = Object.fromEntries(['display', 'position', 'width', 'height', 'padding', 'margin', 'color', 'backgroundColor', 'border', 'borderRadius', 'boxShadow', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'cursor', 'opacity'].map(property => [property, style[property]]));
    return { id: `static-component-${index}`, type: item.tagName === 'A' ? 'LINK' : item.tagName === 'FORM' ? 'FORM' : 'BUTTON',
      label: (item.getAttribute('aria-label') || item.getAttribute('value') || item.textContent || item.id || '').replace(/\s+/g, ' ').trim(), target,
      source: 'STATIC_RENDERED', visible: style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0,
      bounds: { x: box.left + window.scrollX, y: box.top + window.scrollY, width: box.width, height: box.height }, css };
  }).filter(item => item.visible && item.label));
  for (const item of items) {
    const endpoint = endpointByPath.get(item.target);
    const handler = endpoint && handlerByEndpoint.get(endpoint.id);
    const targetScreenId = handler && screenByHandler.get(handler);
    if (targetScreenId) item.targetScreenId = targetScreenId;
  }
  interactions[screen.id] = { width: await page.evaluate(() => document.documentElement.scrollWidth), height: await page.evaluate(() => document.documentElement.scrollHeight), items };
  const file = `static-${screen.id.replace(/[^a-z0-9-]/gi, '_')}.png`;
  await page.screenshot({ path: path.join(screenshotRoot, file), fullPage: true });
  screenshots[screen.id] = `screenshots/${file}`;
}
await browser.close();
await writeFile(path.join(htmlRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
await writeFile(path.join(htmlRoot, 'reconstruction.json'), JSON.stringify(reconstruction, null, 2));
await writeFile(path.join(screenshotRoot, 'manifest.json'), JSON.stringify(screenshots, null, 2));
await writeFile(path.join(screenshotRoot, 'interactions.json'), JSON.stringify(interactions, null, 2));
