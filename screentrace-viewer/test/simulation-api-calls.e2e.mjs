import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fixture, fileFixture, node} from './fixture.mjs';
import {openScreen} from './decision-controls.mjs';

// A front end that calls REST APIs and then moves on: the requests are listed, never offered as destinations.
function apiFixture() {
  const p = fixture(), proof = [{parser: 'Fixture', resolution: 'CONFIRMED', source: {file: 'web/App.tsx', line: 1}}];
  p.graph.nodes.push(node('c', 'SCREEN', '第三畫面', {route: '/third'}), node('login', 'ENDPOINT', '登入', {path: '/api/auth/login', httpMethod: 'POST', category: 'REST_API'}));
  const buttons = {signin: '登入', save: '儲存', route: '依角色前往'};
  for (const id of Object.keys(buttons)) {
    p.graph.nodes.push(node(id, 'COMPONENT', buttons[id], {kind: 'BUTTON'}));
    p.graph.relationships.push({id: 'owner-' + id, type: 'CONTAINS', from: 'a', to: id, confidence: 'CONFIRMED'});
  }
  const call = (id, trigger, target) => ({id, triggerId: trigger, event: 'click', type: 'CALL_API', targetId: target, evidence: proof});
  const go = (id, trigger, target) => ({id, triggerId: trigger, event: 'click', type: 'NAVIGATE', targetId: target, evidence: proof});
  p.graph.behaviors = [
    call('signin-call', 'signin', 'login'), go('signin-go', 'signin', 'b'),
    call('save-call-1', 'save', 'login'), call('save-call-2', 'save', 'ep'),
    call('route-call', 'route', 'login'), go('route-b', 'route', 'b'), go('route-c', 'route', 'c')
  ];
  p.documents.a = '<html><body><button id="signin">登入</button><button id="save">儲存</button><button id="route">依角色前往</button></body></html>';
  p.documents.c = '<html><body>第三畫面</body></html>';
  p.preview.screens.push({graphScreenId: 'c', width: 1280, height: 900});
  p.preview.elements = Object.keys(buttons).map((id, index) => ({graphScreenId: 'a', path: '#' + id, tag: 'button', text: buttons[id], graphComponentId: id,
    componentResolution: 'CONFIRMED', bounds: {x: index * 50, y: 0, width: 40, height: 20}, styleId: 'red'}));
  p.preview.styles = {red: {}};
  return p;
}

test('simulated clicks list API requests and only offer real destinations as choices', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({reducedMotion: 'reduce'});
    await page.goto(await fileFixture(apiFixture()));
    await openScreen(page, 'a');
    await page.locator('.preview[aria-busy=false]').waitFor();
    const button = id => page.frameLocator('iframe').locator('#' + id);

    await button('save').click();
    assert.equal(await page.locator('.simulation-picker').count(), 0);
    assert.match(await page.locator('.prototype-status').innerText(), /留在本頁.*POST \/api\/auth\/login.*GET \/api\/owners/);

    await button('route').click();
    const picker = page.locator('.simulation-picker');
    assert.match(await picker.innerText(), /這個操作會呼叫：[\s\S]*POST \/api\/auth\/login[\s\S]*然後可能前往：/);
    assert.equal(await page.locator('.simulation-choice').count(), 2);
    assert.equal(await page.locator('.simulation-choice', {hasText: '呼叫 API'}).count(), 0);
    await page.locator('.simulation-cancel').click();

    await button('signin').click();
    await page.locator('aside .panel-header h2').filter({hasText: '乙'}).waitFor();
    assert.match(await page.locator('.prototype-status').innerText(), /上一個畫面的操作呼叫 API：POST \/api\/auth\/login/);
  } finally { await browser.close(); }
});
