import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
import { fixture, node } from './fixture.mjs';
import { mdFixture } from './md-fixture.mjs';
import { addStates } from './r82-states-fixture.mjs';

test('R82 state types list every constant in order with who sets it, and keep unresolved writes apart', async () => {
  const states = await ownModule('shared/states'),
    data = addStates(fixture());
  data.graph.nodes.push(node('bad', 'HANDLER', 'Bad.x()', { stateChanges: '[{"enum":1}]' }));
  const [type] = states.stateTypes(data.graph);
  assert.equal(type.name, 'Status');
  assert.deepEqual(type.fields, ['status']);
  assert.deepEqual(
    type.values.map((v) => [v.value, v.label, v.writers.map((w) => w.handler.id)]),
    [
      ['PENDING', undefined, []],
      ['CONFIRMED', '已確認', ['confirm-job']],
      ['CANCELLED', '已取消', ['cancel-handler']],
    ],
  );
  assert.deepEqual(
    type.values[2].writers[0].endpoints.map((e) => e.id),
    ['ep'],
  );
  assert.equal(type.unresolved.length, 1);
  assert.equal(states.stateLabel('CANCELLED', '已取消'), '已取消（CANCELLED）');
  assert.equal(states.stateLabel('PENDING'), 'PENDING');
  assert.deepEqual(states.stateChanges(node('x', 'HANDLER', 'x', { stateChanges: '{' })), []);
});

test('R82 md §13 lists writes per value, values nobody sets, and unresolved writes', async () => {
  const m = await ownModule('shared/review-md'),
    r = await ownModule('shared/review'),
    opts = { generatedAt: '2026-11-18T00:00:00.000Z', toolVersion: 'test' };
  const empty = mdFixture();
  assert.match(
    await m.generateMarkdown(empty, r.emptyReview(empty.graph, empty.fingerprint), opts),
    /## 13\. 資料狀態變更\(誰把哪個狀態設成什麼\)\n\n[^\n]+\n\n未偵測到列舉狀態的寫入。\n\n## 附錄 A/,
  );
  const data = addStates(mdFixture());
  const out = await m.generateMarkdown(data, r.emptyReview(data.graph, data.fingerprint), opts);
  const section = out.split('## 13. ')[1].split('## 附錄 A')[0];
  assert.match(section, /` PENDING ` \| — \| ` 原始碼中找不到設成這個值的地方 `/);
  assert.match(section, /` CONFIRMED ` \| ` 已確認 ` \| ` 系統自動作業 Jobs\.confirm\(\) `/);
  assert.match(section, /` CANCELLED ` \| ` 已取消 ` \| ` GET \/api\/owners `/);
  assert.match(
    section,
    /` — ` \| — \| ` GET \/api\/owners ` \| ` Orders#cancel ` \| ` UNRESOLVED ` ` 值由變數 next 決定 `/,
  );
  const restored = await m.importMarkdown(out, data);
  assert.equal(await m.generateMarkdown(data, restored.state, opts), out);
});

test('R94 the prior state reads in words: one of, none of, or newly created', async () => {
  const states = await ownModule('shared/states');
  const labels = { PENDING: '待確認', CONFIRMED: '已確認' };
  assert.equal(
    states.priorText({ from: ['PENDING', 'CONFIRMED'], labels }),
    '待確認（PENDING） 或 已確認（CONFIRMED）',
  );
  assert.equal(states.priorText({ fromNot: ['COMPLETED'], labels }), '不是 COMPLETED');
  assert.equal(states.priorText({ fromCreated: true }), '新建立');
  assert.equal(states.priorText({ from: 'x' }), undefined);
  assert.equal(states.priorText({}), undefined);
});
