import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
import { node } from './fixture.mjs';

const link = (id, name, line, index, file = 'src/Nav.tsx') => ({
  ...node(id, 'COMPONENT', name, {
    kind: 'LINK',
    expansionAnchor: `src/App.tsx:3 > [${index}] > ${file}:${line}`,
  }),
  source: { file, line },
});

test('R86 links rendered from one list group the screens they lead to, named by the items in order', async () => {
  const f = await ownModule('shared/features');
  const screens = ['home', 'orders', 'settings', 'help', 'lonely'].map((id) =>
    node(id, 'SCREEN', id, { route: `/${id}` }),
  );
  const nav = [link('n0', '訂單', 9, 0), link('n1', '設定', 9, 1)];
  const footer = link('f0', '說明', 20, 0, 'src/Footer.tsx');
  const graph = {
    schemaVersion: '2.2',
    application: { name: 'x', path: '.', technologies: [] },
    nodes: [...screens, ...nav, footer],
    relationships: [
      ...nav.map((n, i) => ({ id: `c${i}`, type: 'CONTAINS', from: 'home', to: n.id })),
      { id: 'c9', type: 'CONTAINS', from: 'home', to: 'f0' },
      { id: 'g0', type: 'NAVIGATES_TO', from: 'n0', to: 'orders' },
      { id: 'g1', type: 'NAVIGATES_TO', from: 'n1', to: 'settings' },
      { id: 'g2', type: 'NAVIGATES_TO', from: 'f0', to: 'help' },
    ],
    behaviors: [],
    apiContracts: [],
    validationRules: [],
  };
  const list = f.features(graph);
  const menu = list.find((x) => x.rule === 'MENU');
  assert.equal(menu.key, 'menu:src/Nav.tsx:9');
  assert.equal(menu.label, '選單：訂單、設定');
  assert.deepEqual(menu.screens, ['orders', 'settings']);
  // A list that leads to one screen only is no menu.
  assert.ok(!list.some((x) => x.key === 'menu:src/Footer.tsx:20'));
  assert.deepEqual(f.usedRules(list), ['MENU']);
});
