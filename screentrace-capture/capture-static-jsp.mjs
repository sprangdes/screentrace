import { lstat, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import {collectElementStyles,thumbnailDataUri,captureOptions} from './element-styles.mjs';
import {annotateConditions,annotateSource,convertControls,expressionList,markupTokens,replaceDynamicExpressions} from './preview-markup.mjs';
import { deduplicateMappings, discoverSpringResourceMappings } from './spring-resource-mappings.mjs';
import { assertOutputPathWithin, createDirectoryWithin, readBufferLimited, readUtf8Limited, resolveExistingDirectoryWithin, resolveExistingFileWithin, writeBufferWithin } from './safe-files.mjs';

const [targetArg, outputArg, ...extraArgs] = process.argv.slice(2);
const previewV2=extraArgs.includes('--preview-v2');
const styleOptions=captureOptions(extraArgs);
if (!targetArg) throw new Error('Usage: capture-static-jsp.mjs <target-project> [output-directory]');
const target = path.resolve(targetArg);
const output = path.resolve(outputArg || path.join(target, '.screentrace'));
await resolveExistingDirectoryWithin(target, target);
const projectRoot = target;
const graph = JSON.parse(await readUtf8Limited(output, path.join(output, 'application-graph.json'), 16 * 1024 * 1024));
if(previewV2&&graph.schemaVersion!=='2.2')throw new Error(`新預覽只接受 schema 2.2，收到 ${graph.schemaVersion??'未設定'}`);
const styleCapture={version:'2',schemaVersion:'2.2',screens:{},styles:{},defaults:{},diagnostics:[]};
const endpointByPath = new Map(graph.nodes.filter(node => node.type === 'ENDPOINT').map(node => [node.attributes?.path, node]));
const handlerByEndpoint = new Map(graph.relationships.filter(edge => edge.type === 'HANDLED_BY').map(edge => [edge.from, edge.to]));
const screenByHandler = new Map(graph.relationships.filter(edge => edge.type === 'RENDERS').map(edge => [edge.from, edge.to]));
let webRoot = path.join(target, 'src/main/webapp');
if(previewV2){for(const candidate of ['src/main/webapp','WebContent','web']){try{await resolveExistingDirectoryWithin(target,path.join(target,candidate));webRoot=path.join(target,candidate);break;}catch{}}}
const tagRoot = path.join(webRoot, 'WEB-INF/tags');
const htmlRoot = path.join(output, 'static-preview');
const screenshotRoot = path.join(output, 'screenshots');
const htmlRootReal = await createDirectoryWithin(output, htmlRoot);
const screenshotRootReal = await createDirectoryWithin(output, screenshotRoot);
async function exists(file, root = projectRoot, kind = 'file') {
  try { return kind === 'directory' ? !!(await resolveExistingDirectoryWithin(root, file)) : !!(await resolveExistingFileWithin(root, file)); }
  catch { return false; }
}
async function text(file) { return readUtf8Limited(projectRoot, file); }
async function writeOutput(file, content) { await writeBufferWithin(output, file, content); }
const captureDiagnostics = [];
const conventionalAssetMappings = [
  [path.join(webRoot, 'resources'), 'resources'], [path.join(webRoot, 'css'), 'css'],
  [path.join(webRoot, 'js'), 'js'], [path.join(webRoot, 'images'), 'images'],
  [path.join(target, 'src/main/resources/static'), ''], [path.join(target, 'src/main/resources/public'), '']
].map(([sourceDir, assetKey]) => ({ urlPrefix: assetKey ? `/${assetKey}/` : null, assetKey, sourceDir }));
const resourceMappings = deduplicateMappings([...conventionalAssetMappings,
  ...await discoverSpringResourceMappings(target, webRoot, file => readUtf8Limited(projectRoot, file, 4 * 1024 * 1024))]);
async function copyAssets() {
  for (const mapping of resourceMappings) if (await exists(mapping.sourceDir, projectRoot, 'directory')) {
    const source = await resolveExistingDirectoryWithin(projectRoot, mapping.sourceDir);
    const destination = await assertOutputPathWithin(output, path.join(htmlRootReal, 'assets', mapping.assetKey));
    await copyDirectory(source, destination, 0);
    await rewriteCssUrls(destination);
  }
}
async function copyDirectory(source, destination, depth) {
  if (depth > 64) { captureDiagnostics.push(`Asset directory depth limit reached: ${source}`); return; }
  await mkdir(await assertOutputPathWithin(output, destination), { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (++assetBudget.files > 100_000) { captureDiagnostics.push('Asset file count limit reached; remaining assets skipped.'); return; }
    const from = path.join(source, entry.name), to = await assertOutputPathWithin(output, path.join(destination, entry.name));
    const info = await lstat(from);
    if (info.isSymbolicLink()) { captureDiagnostics.push(`Symbolic link asset skipped: ${path.relative(projectRoot, from)}`); continue; }
    if (info.isDirectory()) await copyDirectory(from, to, depth + 1);
    else if (info.isFile() && info.size <= 8 * 1024 * 1024 && assetBudget.bytes + info.size <= 1024 * 1024 * 1024) {
      const content = await readBufferLimited(projectRoot, from, Math.min(8 * 1024 * 1024, 1024 * 1024 * 1024 - assetBudget.bytes));
      assetBudget.bytes += content.byteLength;
      await writeBufferWithin(output, to, content);
    } else if (info.isFile()) captureDiagnostics.push(`Asset byte limit reached; skipped ${path.relative(projectRoot, from)}.`);
  }
}
const assetBudget = { files: 0, bytes: 0 };
function mappingFor(url) { return resourceMappings.filter(mapping => mapping.urlPrefix && url.startsWith(mapping.urlPrefix)).sort((a, b) => b.urlPrefix.length - a.urlPrefix.length)[0]; }
async function rewriteCssUrls(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = await assertOutputPathWithin(output, path.join(directory, entry.name));
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await rewriteCssUrls(file);
    else if (entry.isFile() && entry.name.endsWith('.css')) await writeOutput(file,
      (await readUtf8Limited(output, file, 8 * 1024 * 1024)).replace(/url\(\s*(["']?)(\/[^)'"\s]+)(\1)\s*\)/g, (_, quote, url, closingQuote) => {
        const mapping = mappingFor(url);
        if (!mapping) return _;
        const destination = path.join(htmlRoot, 'assets', mapping.assetKey, url.substring(mapping.urlPrefix.length));
        return `url(${quote}${path.relative(path.dirname(file), destination).replaceAll(path.sep, '/')}${closingQuote})`;
      }));
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
  if (depth >= 16) { captureDiagnostics.push('Include depth limit reached; remaining include not rendered.'); return source; }
  let expanded=await replaceAsync(source, /<%@\s*include\s+file\s*=\s*(["'])(.*?)\1\s*%>/gi, async match => {
    const includePath = match[2];
    const file = includePath.startsWith('/') ? path.join(webRoot, includePath) : path.resolve(path.dirname(currentFile), includePath);
    if (stack.has(file) || !(await exists(file, webRoot))) return '';
    const next = new Set(stack); next.add(file);
    const included=await text(file);
    return expandIncludes(previewV2?annotateSource(included,path.relative(target,file).replaceAll(path.sep,'/'),graph.nodes):included, file, next, depth + 1);
  });
  if(previewV2)expanded=await replaceAsync(expanded, /<jsp:include\b([^>]*?)(?:\/>|>[\s\S]*?<\/jsp:include\s*>)/gi,async match=>{const includePath=attrs(match[1]).page;if(!includePath||includePath.includes('${')){captureDiagnostics.push('Dynamic include not rendered.');return '';}const file=includePath.startsWith('/')?path.join(webRoot,includePath):path.resolve(path.dirname(currentFile),includePath);if(stack.has(file)||!(await exists(file,webRoot))){captureDiagnostics.push('Missing or cyclic include not rendered.');return '';}const next=new Set(stack);next.add(file);return expandIncludes(annotateSource(await text(file),path.relative(target,file).replaceAll(path.sep,'/'),graph.nodes),file,next,depth+1);});
  return expanded;
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
  if(previewV2)return replaceDynamicExpressions(source,expression=>{const value=expression.trim(),escaped=value.match(/^fn:escapeXml\((.+)\)$/)?.[1];return values[value]??(escaped?values[escaped]??placeholder(escaped):placeholder(value));});
  return source.replace(/\$\{([^}]+)\}/g, (_, expression) => {
    const value = expression.trim(), escaped = value.match(/^fn:escapeXml\((.+)\)$/)?.[1];
    return values[value] ?? (escaped ? values[escaped] ?? placeholder(escaped) : placeholder(value));
  });
}
let localTagDirs=new Map(),previewExpressions=new Set();
function declaredTagDirs(source){for(const match of source.matchAll(/<%@\s*taglib\b([\s\S]*?)%>/g)){const declaration=attrs(match[1]);if(declaration.prefix&&declaration.tagdir)localTagDirs.set(declaration.prefix,path.join(webRoot,declaration.tagdir));}}
async function expandTag(name, attributeText, body, slots, depth, directory=tagRoot) {
  if (depth > 12) return body;
  const file = path.join(directory, `${name}.tag`);
  if (!(await exists(file))) return body || '';
  const values = attrs(attributeText);
  let template = await text(file);
  if(previewV2){declaredTagDirs(template);expressionList(template).forEach(e=>previewExpressions.add(e));template=await expandIncludes(annotateSource(template,path.relative(target,file).replaceAll(path.sep,'/'),graph.nodes),file,new Set([file]));}
  template=removeDirectives(template);
  template = previewV2?template.replace(/\$\{([^}]+)}/g,(raw,key)=>values[key.trim()]??raw):replaceExpressions(template, values);
  template = template.replace(/<jsp:doBody\b[^>]*\/>/g, body || '');
  template = template.replace(/<jsp:invoke\s+fragment=["']customScript["']\s*\/>/g, slots.customScript || '');
  return expandTags(template, slots, depth + 1);
}
async function expandTags(source, slots = {}, depth = 0) {
  if(previewV2){
    if(depth>12){captureDiagnostics.push('Local tag expansion depth limit reached.');return source;}
    const tokens=markupTokens(source);let result='';
    for(let i=0;i<tokens.length;i++){const token=tokens[i],parts=token.name?.split(':');
      if(!parts||parts.length!==2||token.closing||!localTagDirs.has(parts[0])){result+=token.text;continue;}
      let end=i,body='';if(!token.selfClosing){let nested=1;for(end=i+1;end<tokens.length;end++){const next=tokens[end];if(next.name===token.name&&!next.selfClosing)nested+=next.closing?-1:1;if(nested===0)break;body+=next.text;}if(end===tokens.length){captureDiagnostics.push('Unclosed local tag not rendered.');result+=body;i=end;continue;}}
      result+=await expandTag(parts[1],token.text,body,slots,depth,localTagDirs.get(parts[0]));i=end;
    }return result;
  }
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
  return source.replace(/\b(href|src)=(['"])(\/[^'"]*)/gi, (_, attribute, quote, url) => {
    const mapping = mappingFor(url);
    return mapping ? `${attribute}=${quote}assets/${mapping.assetKey}${url.substring(mapping.urlPrefix.length - 1)}` : _;
  });
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
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<(?:iframe|object|embed|base)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed)\s*>/gi, '')
    .replace(/<(?:iframe|object|embed|base)\b[^>]*\/?>/gi, '')
    .replace(/<meta\b(?=[^>]*http-equiv\s*=\s*["']?refresh)[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src|action|formaction|xlink:href)\s*=\s*(["'])\s*(?:javascript:|file:|https?:|data:text\/html)[\s\S]*?\2/gi, '')
    .replace(/@import\s+(?:url\()?\s*["']?[^;)]*(?:https?:|file:)[^;)]*;?/gi, '')
    .replace(/url\(\s*["']?(?:https?:|file:)[^)]*\)/gi, 'none')
    .replace(/<head([^>]*)>/i, '<head$1><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src file: data:; style-src file: \'unsafe-inline\'; font-src file:; script-src \'none\'; connect-src \'none\'; frame-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">')
    .replace(/\s+(?:items|modelAttribute|names)=["'][^"']*["']/g, '');
}
function dynamicExpressions(source) { return [...source.matchAll(/\$\{[^}]+}/g)].map(match => match[0]); }
async function renderJsp(screen) {
  const view = screen.attributes?.view;
  if (!view || !(previewV2?/\.(?:jsp|jspf|html?|xhtml)$/i.test(view):view.endsWith('.jsp'))) return null;
  const jsp = path.join(target, view);
  if (!(await exists(jsp))) return null;
  const original=await text(jsp);
  if(previewV2){localTagDirs=new Map();previewExpressions=new Set();declaredTagDirs(original);}
  let source = await expandIncludes(previewV2?annotateSource(original,view,graph.nodes):original, jsp, new Set([jsp]));
  if(previewV2)declaredTagDirs(source);
  source = removeDirectives(source);
  const unresolved = previewV2?expressionList(source):dynamicExpressions(source);
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
  if(previewV2){source=convertControls(annotateConditions(source));source=source.replace(/<%(?!@|--)[\s\S]*?%>/g,'示例值');}
  source = rewriteAssetUrls(htmlControls(replaceExpressions(source, urls)));
  if (!/<html[\s>]/i.test(source)) source = `<!doctype html><html><head></head><body>${source}</body></html>`;
  source = source.replace(/<html\b[^>]*>\s*<html\b[^>]*>/gi, '<html>').replace(/<\/head>\s*<head\b[^>]*>/gi, '');
  source = source.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  const htmlFile = await assertOutputPathWithin(output, path.join(htmlRootReal, `${screen.id.replace(/[^a-z0-9-]/gi, '_')}.html`));
  await writeOutput(htmlFile, source);
  return { htmlFile, assets: [...source.matchAll(/\b(?:href|src)=["'](assets\/[^"']+)/gi)].map(match => '/' + match[1]), dynamicExpressions: previewV2?[...new Set([...unresolved,...previewExpressions,...expressionList(source)])]:unresolved };
}

const manifest = {}, screenshots = {}, interactions = {}, reconstruction = {};
const allScreens = graph.nodes.filter(node => node.type === 'SCREEN');
if (!previewV2 && allScreens.length > 500) captureDiagnostics.push(`Maximum of 500 screens reached; skipped ${allScreens.length - 500} screens.`);
const screens = previewV2?allScreens:allScreens.slice(0, 500);
const browser = await chromium.launch({ headless: true });
try {
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, javaScriptEnabled: false });
await context.route('**/*', async route => {
  const url = route.request().url();
  if (!url.startsWith('file:')) return route.abort('blockedbyclient');
  try {
    const local = await resolveExistingFileWithin(htmlRootReal, new URL(url).pathname);
    return local.startsWith(htmlRootReal + path.sep) || local === htmlRootReal ? route.continue() : route.abort('blockedbyclient');
  } catch { return route.abort('blockedbyclient'); }
});
const page = await context.newPage();
page.setDefaultNavigationTimeout(5_000);
page.setDefaultTimeout(3_000);
for (const screen of screens) {
  try {
  const rendered = await renderJsp(screen);
  if (!rendered) {if(previewV2){const diagnostic={code:'PREVIEW_SOURCE_UNAVAILABLE',screenId:screen.id,message:'缺少可重建的畫面來源'};styleCapture.diagnostics.push(diagnostic);styleCapture.screens[screen.id]={rendering:{mode:'skipped',diagnostic:diagnostic.message},elements:[],diagnostics:[diagnostic]};}continue;}
  manifest[screen.id] = `static-preview/${path.basename(rendered.htmlFile)}`;
  reconstruction[screen.id] = { view: screen.attributes?.view, assets: rendered.assets, dynamicExpressions: rendered.dynamicExpressions, rendering: { mode: 'reconstructed' } };
  await page.goto(pathToFileURL(rendered.htmlFile).href, { waitUntil: 'domcontentloaded', timeout: 5_000 });
  const elementCount = await page.locator('*').count();
  if (!previewV2 && elementCount > 50_000) throw new Error(`Rendered page element limit exceeded: ${elementCount}`);
  if(previewV2){const captured=await collectElementStyles(page,context,graph,screen.id,styleOptions);Object.assign(styleCapture.styles,captured.styles);Object.assign(styleCapture.defaults,captured.defaults);styleCapture.diagnostics.push(...captured.diagnostics);styleCapture.screens[screen.id]={elements:captured.elements,diagnostics:captured.diagnostics,...reconstruction[screen.id]};}
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
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
  const width = Math.min(4096, Math.max(1, dimensions.width));
  const height = Math.min(16384, Math.max(1, dimensions.height), Math.floor(16_000_000 / width));
  interactions[screen.id] = { width, height, items };
  const file = `static-${screen.id.replace(/[^a-z0-9-]/gi, '_')}.png`;
  const screenshot = await page.screenshot({ timeout: 5_000, clip: { x: 0, y: 0, width, height }, animations: 'disabled' });
  await writeBufferWithin(output, path.join(screenshotRootReal, file), screenshot);
  screenshots[screen.id] = `screenshots/${file}`;
  if(previewV2){styleCapture.screens[screen.id].thumbnail=await thumbnailDataUri(context,screenshot,width,height);styleCapture.screens[screen.id].width=width;styleCapture.screens[screen.id].height=height;if(width<dimensions.width||height<dimensions.height){const diagnostic={code:'SCREENSHOT_DIMENSION_LIMIT',screenId:screen.id,message:'預覽截圖超過安全尺寸，元素與樣式完整保留',actual:`${dimensions.width}x${dimensions.height}`,limit:`${width}x${height}`};styleCapture.diagnostics.push(diagnostic);styleCapture.screens[screen.id].diagnostics.push(diagnostic);}}
  } catch (error) {
    reconstruction[screen.id] = { view: screen.attributes?.view, rendering: { mode: 'skipped', diagnostic: String(error?.message || error) } };
    if(previewV2){const diagnostic={code:'PREVIEW_CAPTURE_FAILED',screenId:screen.id,message:'預覽擷取失敗，未宣稱資料完整'};styleCapture.diagnostics.push(diagnostic);styleCapture.screens[screen.id]={...(styleCapture.screens[screen.id]||{}),...reconstruction[screen.id],diagnostics:[diagnostic]};}
  }
}
} finally {
  await browser.close();
}
await writeOutput(path.join(htmlRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
await writeOutput(path.join(htmlRoot, 'reconstruction.json'), JSON.stringify(reconstruction, null, 2));
await writeOutput(path.join(screenshotRoot, 'manifest.json'), JSON.stringify(screenshots, null, 2));
await writeOutput(path.join(screenshotRoot, 'interactions.json'), JSON.stringify(interactions, null, 2));
await writeOutput(path.join(htmlRoot, 'diagnostics.json'), JSON.stringify(captureDiagnostics, null, 2));

if(previewV2)await writeOutput(path.join(htmlRoot,'element-styles.json'),JSON.stringify(styleCapture,null,2));
