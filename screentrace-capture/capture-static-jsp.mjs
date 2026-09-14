import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const [targetArg, outputArg] = process.argv.slice(2);
if (!targetArg) throw new Error('Usage: capture-static-jsp.mjs <target-project> [output-directory]');
const target = path.resolve(targetArg);
const output = path.resolve(outputArg || path.join(target, '.screentrace'));
const graph = JSON.parse(await readFile(path.join(output, 'application-graph.json'), 'utf8'));
const webRoot = path.join(target, 'src/main/webapp');
const tagRoot = path.join(webRoot, 'WEB-INF/tags');
const htmlRoot = path.join(output, 'static-preview');
await mkdir(htmlRoot, { recursive: true });
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

const manifest = {};
for (const screen of graph.nodes.filter(node => node.type === 'SCREEN')) {
  const htmlFile = await renderJsp(screen);
  if (!htmlFile) continue;
  manifest[screen.id] = `static-preview/${path.basename(htmlFile)}`;
}
await writeFile(path.join(htmlRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
