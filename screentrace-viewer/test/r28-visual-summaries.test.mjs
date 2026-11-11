import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
const source = { file: 'workspace:config.json', line: 1 };
const screen = (id) => ({
  id,
  type: 'SCREEN',
  name: id,
  attributes: { route: '/' + id },
  confidence: 'CONFIRMED',
});
// member: a at step 1, b and c at step 2 (c possible), d at step 3; e does not apply, f is never reached.
function graph() {
  const reached = [
    ['a', 1, 'REACHABLE'],
    ['b', 2, 'REACHABLE'],
    ['c', 2, 'POSSIBLE'],
    ['d', 3, 'REACHABLE'],
  ];
  const member = {
    id: 'member',
    name: '會員',
    facts: [{ text: 'user', truth: true, source }],
    startPaths: ['/'],
    screens: {
      a: 'APPLIES',
      b: 'APPLIES',
      c: 'UNKNOWN',
      d: 'APPLIES',
      e: 'EXCLUDED',
      f: 'APPLIES',
    },
    navigations: [],
    flow: {
      entryPoints: ['entry:root'],
      reached: reached.map(([screenId, depth, reach]) => ({ screenId, reach, depth })),
      unreached: ['f'],
      steps: [],
      unevaluatedNavigations: 1,
    },
  };
  return {
    schemaVersion: '2.4',
    application: { name: 'sample', personas: [member] },
    nodes: ['a', 'b', 'c', 'd', 'e', 'f'].map(screen),
    relationships: [],
    behaviors: [],
  };
}

test('R28 API status counts cover every status, in the page order, including the ones no API has', async () => {
  const api = await ownModule('api-page');
  assert.deepEqual(
    api.apiStatusCounts(['UNREFERENCED', 'IN_USE', 'IN_USE', 'UNREFERENCED', 'IN_USE']),
    { IN_USE: 3, UNREFERENCED: 2, REMOVABLE: 0 },
  );
  assert.deepEqual(Object.keys(api.apiStatusCounts([])), ['IN_USE', 'UNREFERENCED', 'REMOVABLE']);
});

test('R28 persona reach shares and step counts follow the flow the analysis gave', async () => {
  const p = await ownModule('personas'),
    m = await ownModule('map'),
    g = graph(),
    index = m.indexGraph(g),
    view = p.personaView(index, p.graphPersonas(g)[0]);
  assert.deepEqual(p.reachShares(view), [
    { key: 'REACHABLE', count: 3 },
    { key: 'POSSIBLE', count: 1 },
    { key: 'UNREACHED', count: 1 },
    { key: 'EXCLUDED', count: 1 },
  ]);
  assert.equal(p.reachCountsLabel(view), '會走到 3、可能走到 1、走不到 1、不適用 1');
  assert.deepEqual(p.stepCounts(view), [
    { step: 1, reachable: 1, possible: 0 },
    { step: 2, reachable: 1, possible: 1 },
    { step: 3, reachable: 1, possible: 0 },
  ]);
});
