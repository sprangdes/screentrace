import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
import { fixture, node } from './fixture.mjs';

test('R32 a path splits into fixed text and {name} parameters that join back into the path', async () => {
  const api = await ownModule('api-page');
  assert.deepEqual(api.pathParts('/api/businesses/{businessId}/services/{id}'), [
    { text: '/api/businesses/', param: false },
    { text: '{businessId}', param: true },
    { text: '/services/', param: false },
    { text: '{id}', param: true },
  ]);
  assert.deepEqual(api.pathParts('/api/owners'), [{ text: '/api/owners', param: false }]);
  assert.deepEqual(
    api.pathParts('/a/{x/y}'),
    [{ text: '/a/{x/y}', param: false }],
    'braces across a slash are not a parameter',
  );
  assert.deepEqual(api.pathParts(''), []);
  for (const path of ['/api/{a}{b}', '/{id}', '/x/{}'])
    assert.equal(
      api
        .pathParts(path)
        .map((p) => p.text)
        .join(''),
      path,
    );
});

test('R32 a bar is the share of the most, and a count that is there never draws as nothing', async () => {
  const share = await ownModule('proportion'),
    page = await ownModule('persona-page');
  assert.equal(share.sharePercent(36, 36), 100);
  assert.equal(share.sharePercent(1, 36), 3);
  assert.equal(share.sharePercent(1, 500), 1);
  assert.equal(share.sharePercent(0, 36), 0);
  assert.equal(share.sharePercent(0, 0), 0);
  for (const [count, total] of [
    [1, 36],
    [7, 9],
    [0, 4],
    [2, 0],
  ])
    assert.equal(
      page.overlapPercent(count, total),
      share.sharePercent(count, total),
      'the persona overlap bar uses the same rule',
    );
});

test('R32 the coverage table lists reached screens grouped by the first persona that reaches them', async () => {
  const page = await ownModule('persona-page'),
    m = await ownModule('map'),
    d = fixture();
  d.graph.nodes.push(node('c', 'SCREEN', '丙', { route: '/c' }));
  const index = m.indexGraph(d.graph);
  const view = (id, depth) => ({ persona: { id }, depth: new Map(Object.entries(depth)) });
  const views = [view('visitor', { b: 2 }), view('member', { a: 1, b: 1 })];
  assert.deepEqual(
    page.coverageScreens(index, views),
    ['b', 'a'],
    "b is the visitor's, a only the member's; c is reached by nobody",
  );
  assert.deepEqual(
    page.coverageScreens(index, [view('x', { a: 2, b: 1 })]),
    ['b', 'a'],
    'by step within a persona',
  );
  assert.deepEqual(
    page.coverageScreens(index, [view('x', { a: 1, b: 1 })]),
    ['b', 'a'],
    'then by name in stroke order, 乙 before 甲',
  );
  assert.deepEqual(page.coverageScreens(index, [view('x', {})]), []);
});
