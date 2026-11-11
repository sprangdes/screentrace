import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
import { fixture, node } from './fixture.mjs';

test('R29 the call chain lists each calling screen once, by name, with what on it triggers the API', async () => {
  const api = await ownModule('api-page'),
    m = await ownModule('map'),
    d = fixture();
  d.graph.nodes.push(node('load', 'COMPONENT', '', { kind: 'BUTTON' }));
  d.graph.relationships.push({ id: '4', type: 'CONTAINS', from: 'b', to: 'load' });
  const index = m.indexGraph(d.graph);
  const chain = api.chainScreens(index, [
    { screenId: 'b', componentId: 'shared' },
    { screenId: 'a', componentId: 'shared' },
    { screenId: 'b', componentId: 'load' },
    { screenId: 'a', componentId: 'shared' },
  ]);
  assert.deepEqual(
    chain.map((c) => c.screenId),
    ['b', 'a'],
    'screens follow their names in stroke order, 乙 before 甲',
  );
  assert.deepEqual(chain[0].triggers, ['共用按鈕 按鈕', '按鈕（無文字）']);
  assert.deepEqual(chain[1].triggers, ['共用按鈕 按鈕'], 'the same trigger twice is listed once');
  assert.deepEqual(api.chainScreens(index, []), []);
  assert.equal(api.CHAIN_LIMIT, 5);
});

test('R29 an overlap bar is the group share of the persona screens, never a sliver for a real group', async () => {
  const page = await ownModule('persona-page');
  assert.equal(page.overlapPercent(1, 4), 25);
  assert.equal(page.overlapPercent(4, 4), 100);
  assert.equal(page.overlapPercent(1, 300), 1, 'one screen of many still shows');
  assert.equal(page.overlapPercent(0, 4), 0);
  assert.equal(page.overlapPercent(0, 0), 0);
});
