import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
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
if (await exists(path.join(webRoot, 'resources'))) await cp(path.join(webRoot, 'resources'), path.join(htmlRoot, 'assets/resources'), { recursive: true });

async function exists(file) { try { await access(file, constants.R_OK); return true; } catch { return false; } }
async function text(file) { return readFile(file, 'utf8'); }
function attrs(source) {
  const values = {};
  for (const match of source.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) values[match[1]] = match[3];
  return values;
}
function removeDirectives(source) { return source.replace(/<%@[^%]*%>/g, '').replace(/<%--[\s\S]*?--%>/g, ''); }
function placeholder(expression) {
  const value = expression.trim();
  if (value.includes('pageContext')) return '';
  if (/\.id$/.test(value)) return 'Sample ID';
  if (/owner\.(firstName|lastName)/.test(value)) return 'Sample Owner';
  if (/errorMessage/.test(value)) return 'Validation message';
  return value.split(/[.[' ]/)[0].replace(/^./, c => c.toUpperCase()) || 'Sample value';
}
function replaceExpressions(source, values = {}) {
  return source.replace(/\$\{([^}]+)\}/g, (_, expression) => values[expression.trim()] ?? placeholder(expression));
}
async function expandTag(name, attributeText, body, slots, depth) {
  if (depth > 12) return body;
  const file = path.join(tagRoot, `${name}.tag`);
  if (!(await exists(file))) return body || '';
  const values = attrs(attributeText);
  let template = removeDirectives(await text(file));
  template = template.replace(/<jsp:doBody\s*\/>/g, body || '');
  template = template.replace(/<jsp:invoke\s+fragment=["']customScript["']\s*\/>/g, slots.customScript || '');
  template = replaceExpressions(template, values);
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
function htmlControls(source) {
  return source
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
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\s+(?:items|modelAttribute|names)=["'][^"']*["']/g, '');
}
function cssLinks(source) {
  return [...source.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css)["'][^>]*>/gi)].map(match => match[1]).filter(href => href.includes('/resources/'));
}
function localStaticResources(source) {
  return source.replace(/\bsrc=(["'])(\/resources\/[^"']+)\1/gi, (_, quote, resource) =>
    `src=${quote}assets${resource}${quote}`);
}
async function renderJsp(screen) {
  const view = screen.attributes?.view;
  if (!view || !view.endsWith('.jsp')) return null;
  const jsp = path.join(target, view);
  if (!(await exists(jsp))) return null;
  let source = removeDirectives(await text(jsp));
  const custom = source.match(/<jsp:attribute\s+name=["']customScript["'][^>]*>([\s\S]*?)<\/jsp:attribute>/)?.[1] || '';
  source = source.replace(/<jsp:attribute\s+name=["']customScript["'][^>]*>[\s\S]*?<\/jsp:attribute>/g, '');
  source = await expandTags(source, { customScript: custom });
  const urls = {};
  source = source.replace(/<spring:url\s+value=["']([^"']+)["']\s+var=["']([^"']+)["'][^>]*\/>/g, (_, value, variable) => {
    urls[variable] = value;
    return '';
  });
  source = localStaticResources(htmlControls(replaceExpressions(source, urls)));
  const links = cssLinks(source).map(href => {
    return `<link rel="stylesheet" href="assets${href}">`;
  }).join('\n');
  if (!/<html[\s>]/i.test(source)) source = `<!doctype html><html><head>${links}</head><body>${source}</body></html>`;
  else source = source.replace(/<\/head>/i, `${links}</head>`);
  const htmlFile = path.join(htmlRoot, `${screen.id}.html`);
  await writeFile(htmlFile, source);
  return htmlFile;
}

const manifest = {}, screenshots = {}, interactions = {};
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
for (const screen of graph.nodes.filter(node => node.type === 'SCREEN')) {
  const htmlFile = await renderJsp(screen);
  if (!htmlFile) continue;
  manifest[screen.id] = `static-preview/${path.basename(htmlFile)}`;
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
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
await writeFile(path.join(screenshotRoot, 'manifest.json'), JSON.stringify(screenshots, null, 2));
await writeFile(path.join(screenshotRoot, 'interactions.json'), JSON.stringify(interactions, null, 2));
