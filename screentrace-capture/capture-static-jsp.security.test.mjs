import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink, lstat } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';

test('static capture sanitizes active markup and makes no external requests', async () => {
  let requests = 0;
  const server = http.createServer((_request, response) => { requests++; response.end('blocked'); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const root = await mkdtemp(path.join(os.tmpdir(), 'screentrace-capture-'));
  const output = path.join(root, 'analysis');
  const jsp = path.join(root, 'src/main/webapp/WEB-INF/jsp/page.jsp');
  const css = path.join(root, 'src/main/webapp/css');
  const outside = await mkdtemp(path.join(os.tmpdir(), 'screentrace-assets-outside-'));
  await mkdir(path.dirname(jsp), { recursive: true });
  await mkdir(css, { recursive: true });
  await mkdir(output, { recursive: true });
  const url = `http://127.0.0.1:${server.address().port}`;
  await writeFile(output + '/application-graph.json', JSON.stringify({
    nodes: [{ id: 'screen:secure', type: 'SCREEN', attributes: { view: 'src/main/webapp/WEB-INF/jsp/page.jsp' } }], relationships: []
  }));
  await writeFile(jsp, `<!doctype html><html><head><script>document.body.dataset.executed='yes'</script><script src="${url}/evil.js"></script><link rel="stylesheet" href="${url}/evil.css"><style>@import url(${url}/import.css)</style></head><body onload="fetch('${url}/event')"><img src="${url}/pixel.png" onerror="fetch('${url}/error')"><iframe src="${url}/frame"></iframe><button>Safe</button></body></html>`);
  await writeFile(path.join(outside, 'secret.css'), 'body{color:red}');
  await symlink(path.join(outside, 'secret.css'), path.join(css, 'escape.css'));

  const child = spawn(process.execPath, [path.resolve('screentrace-capture/capture-static-jsp.mjs'), root, output], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const status = await new Promise(resolve => child.on('close', resolve));
  server.close();
  assert.equal(status, 0, stdout + stderr);
  assert.equal(requests, 0);
  const rendered = await readFile(path.join(output, 'static-preview/screen_secure.html'), 'utf8');
  assert.doesNotMatch(rendered, /<script\b|<iframe\b|onload=|onerror=|evil\.css|pixel\.png/i);
  assert.match(rendered, /script-src 'none'/);
  await assert.rejects(lstat(path.join(output, 'static-preview/assets/css/escape.css')));
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

test('preexisting output symlink is rejected before writing outside the output root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'screentrace-output-link-'));
  const output = path.join(root, 'analysis');
  const outside = await mkdtemp(path.join(os.tmpdir(), 'screentrace-output-target-'));
  await mkdir(path.join(root, 'src/main/webapp'), { recursive: true });
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'application-graph.json'), JSON.stringify({ nodes: [], relationships: [] }));
  await symlink(outside, path.join(output, 'static-preview'));
  const child = spawn(process.execPath, [path.resolve('screentrace-capture/capture-static-jsp.mjs'), root, output], { stdio: ['ignore', 'pipe', 'pipe'] });
  const status = await new Promise(resolve => child.on('close', resolve));
  assert.notEqual(status, 0);
  assert.deepEqual(await (await import('node:fs/promises')).readdir(outside), []);
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

test('a Tiles list attribute looped by the layout links every listed stylesheet', async () => {
  // RawSanj/spring-tiles-sample-app: <put-list-attribute name="stylesheets"> + tilesx:useAttribute + c:forEach left
  // <c:url value="${css}"/> unresolved, so the AdminLTE pages rendered without styles.
  const root = await mkdtemp(path.join(os.tmpdir(), 'screentrace-capture-tiles-list-'));
  const output = path.join(root, 'analysis');
  const web = path.join(root, 'src/main/webapp');
  await mkdir(path.join(web, 'WEB-INF/layout'), { recursive: true });
  await mkdir(path.join(web, 'resources/css'), { recursive: true });
  await mkdir(output, { recursive: true });
  await writeFile(path.join(web, 'resources/css/app.css'), 'h1{color:rgb(1, 2, 3)}');
  await writeFile(path.join(web, 'WEB-INF/layout/common.jsp'), '<%@ taglib uri="http://tiles.apache.org/tags-tiles-extras" prefix="tilesx" %>'
    + '<html><head><tilesx:useAttribute id="stylesheets" name="stylesheets" classname="java.util.List" />'
    + '<c:forEach var="css" items="${stylesheets}"><link rel="stylesheet" type="text/css" href="<c:url value="${css}"/>"></c:forEach></head>'
    + '<body><h1>Tracker</h1></body></html>');
  await writeFile(output + '/application-graph.json', JSON.stringify({ schemaVersion: '2.2', nodes: [{ id: 'screen:home', type: 'SCREEN', attributes: {
    view: 'src/main/webapp/WEB-INF/layout/common.jsp', tilesDefinition: 'true', tilesDefinitionName: 'home',
    tilesAttributes: JSON.stringify({ template: 'src/main/webapp/WEB-INF/layout/common.jsp', attributes: { stylesheets: { list: ['/resources/css/app.css'] } } }) } }], relationships: [] }));

  const child = spawn(process.execPath, [path.resolve('screentrace-capture/capture-static-jsp.mjs'), root, output, '--preview-v2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const status = await new Promise(resolve => child.on('close', resolve));
  try {
    assert.equal(status, 0, stdout + stderr);
    const rendered = await readFile(path.join(output, 'static-preview/screen_home.html'), 'utf8');
    assert.doesNotMatch(rendered, /\$\{css\}|c:forEach/);
    assert.match(rendered, /<link[^>]+href="[^"]*resources\/css\/app\.css"/);
    const capture = JSON.parse(await readFile(path.join(output, 'static-preview/element-styles.json'), 'utf8'));
    const heading = capture.screens['screen:home'].elements.find(element => element.tag === 'h1');
    assert.equal(capture.styles[heading.styleId].color, 'rgb(1, 2, 3)', 'the listed stylesheet is applied');
  } finally { await rm(root, { recursive: true, force: true }); }
});
