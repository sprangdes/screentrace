import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
const source = { file: 'workspace:config.json', line: 1 };
const screen = (id, route) => ({
  id,
  type: 'SCREEN',
  name: id,
  attributes: { route },
  confidence: 'CONFIRMED',
});
function graph(schemaVersion = '2.4') {
  const steps = [
    { from: 'entry:root', to: 's1', kind: 'RENDERS', behaviorId: null, status: 'APPLIES' },
    { from: 's1', to: 's1', kind: 'NAVIGATE', behaviorId: 'b4', status: 'UNKNOWN' },
    { from: 's1', to: 's2', kind: 'NAVIGATE', behaviorId: 'b1', status: 'UNKNOWN' },
    { from: 's1', to: 's2', kind: 'NAVIGATE', behaviorId: 'b2', status: 'APPLIES' },
    { from: 's2', to: 'entry:root', kind: 'NAVIGATE', behaviorId: 'b3', status: 'UNKNOWN' },
  ];
  const member = {
    id: 'member',
    name: '會員',
    facts: [{ text: 'user', truth: true, source }],
    startPaths: ['/'],
    screens: { s1: 'APPLIES', s2: 'UNKNOWN', s3: 'EXCLUDED', s4: 'APPLIES' },
    navigations: [],
    flow: {
      entryPoints: ['entry:root'],
      reached: [
        { screenId: 's1', reach: 'REACHABLE', depth: 1 },
        { screenId: 's2', reach: 'POSSIBLE', depth: 2 },
      ],
      unreached: ['s4'],
      steps,
      unevaluatedNavigations: 3,
    },
  };
  return {
    schemaVersion,
    application: {
      name: 'sample',
      personas: [
        member,
        { id: 1, name: '壞資料' },
        {
          id: 'noflow',
          name: '無流程',
          facts: [],
          startPaths: ['/'],
          screens: { s3: 'EXCLUDED' },
          navigations: [],
        },
      ],
    },
    nodes: [screen('s1', '/'), screen('s2', '/a'), screen('s3', '/b'), screen('s4', '/c')],
    relationships: [],
    behaviors: [],
  };
}
test('R20 personas are read only from schema 2.4 and malformed entries are dropped', async () => {
  const p = await ownModule('personas');
  assert.deepEqual(p.graphPersonas(graph('2.3')), []);
  assert.deepEqual(
    p.graphPersonas(graph()).map((x) => x.id),
    ['member', 'noflow'],
  );
  const g = graph();
  g.application.personas = 'bad';
  assert.deepEqual(p.graphPersonas(g), []);
});
test('R20 persona view places every screen and keeps screen-to-screen flow lines only', async () => {
  const p = await ownModule('personas'),
    m = await ownModule('map');
  const g = graph(),
    index = m.indexGraph(g),
    [member, noflow] = p.graphPersonas(g);
  const view = p.personaView(index, member);
  assert.deepEqual(Object.fromEntries(view.reach), {
    s1: 'REACHABLE',
    s2: 'POSSIBLE',
    s3: 'EXCLUDED',
    s4: 'UNREACHED',
  });
  assert.deepEqual(Object.fromEntries(view.depth), { s1: 1, s2: 2 });
  assert.deepEqual(Object.fromEntries(view.lines), {
    [p.lineKey('s1', 's1')]: 'UNKNOWN',
    [p.lineKey('s1', 's2')]: 'APPLIES',
  });
  assert.deepEqual(view.counts, { REACHABLE: 1, POSSIBLE: 1, UNREACHED: 1, EXCLUDED: 1 });
  assert.equal(view.unevaluated, 3);
  const empty = p.personaView(index, noflow);
  assert.deepEqual(Object.fromEntries(empty.reach), {
    s1: 'UNREACHED',
    s2: 'UNREACHED',
    s3: 'EXCLUDED',
    s4: 'UNREACHED',
  });
  assert.equal(empty.lines.size, 0);
  assert.equal(empty.unevaluated, 0);
});
test('R20 flow groups list steps in order, then unreached, then excluded', async () => {
  const p = await ownModule('personas'),
    m = await ownModule('map');
  const g = graph(),
    index = m.indexGraph(g),
    view = p.personaView(index, p.graphPersonas(g)[0]);
  assert.deepEqual(
    p.flowGroups(index, view).map((group) => [group.key, group.title, group.screens]),
    [
      ['step-1', '第 1 步', ['s1']],
      ['step-2', '第 2 步', ['s2']],
      ['unreached', '走不到', ['s4']],
      ['excluded', '不適用', ['s3']],
    ],
  );
  assert.equal(p.reachText(view, 's2'), '可能走到 · 第 2 步');
  assert.equal(p.reachText(view, 's3'), '不適用');
  assert.equal(p.factLabel({ text: 'me.business', truth: false }), 'me.business：否');
});
