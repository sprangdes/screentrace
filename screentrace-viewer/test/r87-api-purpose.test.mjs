import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
import { fixture, node } from './fixture.mjs';

test('R87 an API purpose is read from its callers: buttons first, then screens that call it on load', async () => {
  const api = await ownModule('api-page'),
    map = await ownModule('map'),
    data = fixture();
  data.graph.nodes.push(node('cancel', 'COMPONENT', '取消預約', { kind: 'BUTTON' }));
  data.graph.relationships.push({ id: 'c', type: 'CONTAINS', from: 'a', to: 'cancel' });
  const index = map.indexGraph(data.graph);
  const buttons = api.apiPurpose(index, [
    { screenId: 'a', componentId: 'cancel' },
    { screenId: 'b' },
  ]);
  assert.equal(buttons.short, '取消預約、畫面載入時');
  assert.match(buttons.sentence, /^按下「取消預約」時呼叫；開啟「.+」時自動呼叫。$/);
  const loads = api.apiPurpose(index, [{ screenId: 'a' }, { screenId: 'b' }]);
  assert.equal(loads.short, '畫面載入時');
  assert.match(loads.sentence, /等 2 個畫面時自動呼叫。$/);
  assert.equal(api.apiPurpose(index, [], true).sentence, '由外部系統（Webhook）呼叫。');
  assert.equal(api.apiPurpose(index, []), undefined);
});

test('R87 in-progress wording, sample values and bare tags do not describe an API', async () => {
  const api = await ownModule('api-page'),
    map = await ownModule('map'),
    data = fixture();
  data.graph.nodes.push(
    node('busy', 'COMPONENT', '送出中… / 送出', { kind: 'BUTTON' }),
    node('sample', 'COMPONENT', '示例值', { kind: 'BUTTON' }),
    node('bare', 'COMPONENT', '<button>', { kind: 'BUTTON' }),
  );
  for (const id of ['busy', 'sample', 'bare'])
    data.graph.relationships.push({ id: `c-${id}`, type: 'CONTAINS', from: 'a', to: id });
  const index = map.indexGraph(data.graph);
  const purpose = api.apiPurpose(
    index,
    ['busy', 'sample', 'bare'].map((componentId) => ({ screenId: 'a', componentId })),
  );
  assert.equal(purpose.short, '送出');
});

test('R102 a button whose only text is in-progress wording is described by it', async () => {
  const api = await ownModule('api-page'),
    map = await ownModule('map'),
    data = fixture();
  data.graph.nodes.push(node('busy', 'COMPONENT', '處理中', { kind: 'BUTTON' }));
  data.graph.relationships.push({ id: 'c-busy', type: 'CONTAINS', from: 'a', to: 'busy' });
  const purpose = api.apiPurpose(map.indexGraph(data.graph), [
    { screenId: 'a', componentId: 'busy' },
  ]);
  assert.equal(purpose.short, '顯示「處理中」的按鈕');
});
