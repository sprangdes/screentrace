import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
import { node } from './fixture.mjs';

const change = (value, extra = {}) => ({
  depth: 1,
  in: 'Users#create',
  enum: 'Role',
  field: 'role',
  value,
  values: ['ROLE_USER', 'ROLE_BUSINESS'],
  fromCreated: true,
  resolution: 'CONFIRMED',
  ...extra,
});
const persona = (id, value, name = value.replace(/^ROLE_/, '')) => ({
  id,
  name,
  description: `自動建議：依路由條件 me.role === "${value}"`,
  facts: [
    { text: 'me', truth: true },
    { text: `me.role === "${value}"`, truth: true },
  ],
  screens: {},
});
function graph(personas) {
  return {
    schemaVersion: '2.4',
    application: { name: 'demo', personas },
    nodes: [
      node('s-user', 'SCREEN', 'register'),
      node('s-biz', 'SCREEN', 'register-business'),
      node('c-user', 'COMPONENT', 'submit'),
      node('ep-user', 'ENDPOINT', 'POST /api/register'),
      node('ep-biz', 'ENDPOINT', 'POST /api/register-business'),
      node('h-user', 'HANDLER', 'Auth.register()', {
        stateChanges: JSON.stringify([change('ROLE_USER')]),
      }),
      node('h-biz', 'HANDLER', 'Auth.registerBusiness()', {
        stateChanges: JSON.stringify([change('ROLE_BUSINESS')]),
      }),
    ],
    relationships: [
      { id: 'r1', type: 'CONTAINS', from: 's-user', to: 'c-user' },
      { id: 'r2', type: 'TRIGGERS', from: 'c-user', to: 'ep-user' },
      { id: 'r3', type: 'CALLS', from: 's-biz', to: 'ep-biz' },
      { id: 'r4', type: 'HANDLED_BY', from: 'ep-user', to: 'h-user' },
      { id: 'r5', type: 'HANDLED_BY', from: 'ep-biz', to: 'h-biz' },
    ],
    behaviors: [],
  };
}

test('R103 a suggested role is named by the heading of the screen that creates its accounts', async () => {
  const m = await ownModule('shared/persona-names');
  const headings = { 's-user': '建立客戶帳號', 's-biz': ' 建立商家帳號 ' };
  const g = graph([persona('role-user', 'ROLE_USER'), persona('role-business', 'ROLE_BUSINESS')]);
  const names = m.suggestedPersonaNames(g, (id) => headings[id]);
  assert.deepEqual(Object.fromEntries(names), {
    'role-user': { name: '客戶', heading: '建立客戶帳號' },
    'role-business': { name: '商家', heading: '建立商家帳號' },
  });
  const named = m.withSuggestedPersonaNames(g, names);
  assert.equal(named.application.personas[1].name, '商家');
  assert.match(
    named.application.personas[1].description,
    /名稱取自建立此角色帳號的畫面「建立商家帳號」$/,
  );
  assert.equal(g.application.personas[1].name, 'BUSINESS', 'the input graph is not changed');
});

test('R103 configured personas, unmatched headings and taken names keep their names', async () => {
  const m = await ownModule('shared/persona-names');
  const configured = { ...persona('biz', 'ROLE_BUSINESS', '店家'), description: '商家帳號' };
  assert.equal(m.suggestedPersonaNames(graph([configured]), () => '建立商家帳號').size, 0);
  const g = graph([persona('role-user', 'ROLE_USER'), persona('role-business', 'ROLE_BUSINESS')]);
  assert.equal(m.suggestedPersonaNames(g, (id) => (id === 's-user' ? '註冊' : undefined)).size, 0);
  // Both screens say the same word: the second role cannot take a name the first already has.
  const same = m.suggestedPersonaNames(g, () => '建立會員帳號');
  assert.deepEqual([...same.keys()], ['role-user']);
  const taken = graph([persona('role-user', 'ROLE_USER'), { id: 'x', name: '客戶', facts: [] }]);
  assert.equal(m.suggestedPersonaNames(taken, () => '建立客戶帳號').size, 0);
});

test('R103 a prior state known for only some ways in says so', async () => {
  const states = await ownModule('shared/states');
  assert.equal(
    states.priorText({ from: ['SELECTING_TIME'], fromPartial: true }),
    'SELECTING_TIME，或其他推不出的狀態',
  );
  const g = {
    nodes: [
      node('h', 'HANDLER', 'H.go()', {
        stateChanges: JSON.stringify([
          {
            depth: 0,
            in: 'H#a',
            enum: 'S',
            field: 's',
            value: 'B',
            from: ['A'],
            fromPartial: true,
            values: ['A', 'B'],
            resolution: 'CONFIRMED',
          },
        ]),
      }),
    ],
    relationships: [],
  };
  const [t] = states.stateTransitions(states.stateTypes(g)[0]);
  assert.deepEqual([t.from, t.to, t.partial], ['A', 'B', true]);
});
