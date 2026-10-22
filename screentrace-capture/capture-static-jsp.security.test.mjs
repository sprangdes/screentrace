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

test('a Maven submodule web root supplies its message bundle and struts-menu items', async () => {
  // oussamazoghlami/SpringStrutsHibernate: everything lives under StrutsSpringExample/, so the preview showed
  // "（訊息 key：customer.label.name）" and an empty menu column.
  const root = await mkdtemp(path.join(os.tmpdir(), 'screentrace-capture-module-'));
  const output = path.join(root, 'analysis');
  const module = path.join(root, 'StrutsSpringExample');
  await mkdir(path.join(module, 'src/main/webapp/WEB-INF'), { recursive: true });
  await mkdir(path.join(module, 'src/main/resources'), { recursive: true });
  await mkdir(output, { recursive: true });
  await writeFile(path.join(module, 'src/main/webapp/WEB-INF/struts-config.xml'), '<struts-config><message-resources parameter="Customer"/>'
    + '<plug-in className="net.sf.navigator.menu.MenuPlugIn"><set-property property="menuConfig" value="/WEB-INF/menu-config.xml"/></plug-in></struts-config>');
  await writeFile(path.join(module, 'src/main/webapp/WEB-INF/menu-config.xml'), '<MenuConfig><Menus><Menu name="adminCustomer"><Item title="Add a new customer" location="AddCustomer.do"/></Menu></Menus></MenuConfig>');
  await writeFile(path.join(module, 'src/main/resources/Customer.properties'), 'customer.label.name = Name\n');
  await writeFile(path.join(module, 'src/main/webapp/add.jsp'), '<%@ taglib uri="http://struts.apache.org/tags-bean" prefix="bean"%><%@ taglib uri="http://struts-menu.sf.net/tag" prefix="menu" %>'
    + '<html><body><nav><menu:displayMenu name="adminCustomer"/></nav><label><bean:message key="customer.label.name"/></label></body></html>');
  await writeFile(output + '/application-graph.json', JSON.stringify({ schemaVersion: '2.2',
    nodes: [{ id: 'screen:add', type: 'SCREEN', attributes: { view: 'StrutsSpringExample/src/main/webapp/add.jsp' } }], relationships: [] }));

  const child = spawn(process.execPath, [path.resolve('screentrace-capture/capture-static-jsp.mjs'), root, output, '--preview-v2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const status = await new Promise(resolve => child.on('close', resolve));
  try {
    assert.equal(status, 0, stdout + stderr);
    const rendered = await readFile(path.join(output, 'static-preview/screen_add.html'), 'utf8');
    assert.match(rendered, /<label[^>]*>Name<\/label>/);
    assert.doesNotMatch(rendered, /訊息 key/);
    assert.match(rendered, />Add a new customer<\/a>/);
    assert.doesNotMatch(rendered, /displayMenu/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
