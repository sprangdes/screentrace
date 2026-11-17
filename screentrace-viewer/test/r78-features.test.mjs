// R78 (ADR 0156): features by deterministic rules, feature decisions inherited by screens, md §8–§11 and format 5.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
import { node } from './fixture.mjs';
import { featureFixture, edge } from './r78-feature-fixture.mjs';

test('R78 features follow the rule priority, need two screens per value, and keep the rule source', async () => {
  const f = await ownModule('shared/features'),
    data = featureFixture(),
    list = f.features(data.graph);
  assert.deepEqual(
    list.map((x) => [x.key, x.rule, x.label, x.screens]),
    [
      ['url:/vets', 'URL', '/vets', ['vet', 'vets']],
      ['class:demo.OwnerController', 'HANDLER_CLASS', 'Owner', ['done', 'edit', 'list']],
      ['other', 'OTHER', '其他', ['about']],
    ],
  );
  assert.deepEqual(list[1].sources, [
    { file: 'web/owner-c.jsp', line: 1 },
    { file: 'web/owner-c2.jsp', line: 1 },
  ]);
  // Flows start at screens no other screen of the feature leads to, in navigation order.
  assert.deepEqual(list[1].flows, [{ entry: 'list', screens: ['list', 'edit', 'done'] }]);
  assert.deepEqual(list[0].flows, [{ entry: 'vets', screens: ['vets', 'vet'] }]);
  // Input order never changes the result.
  const reversed = structuredClone(data.graph);
  reversed.nodes.reverse();
  reversed.relationships.reverse();
  assert.deepEqual(f.features(reversed), list);
});

test('R78 Struts modules and Tiles prefixes group screens before URLs; loops still form flows', async () => {
  const f = await ownModule('shared/features'),
    graph = featureFixture().graph;
  graph.nodes = graph.nodes.filter((n) => n.type !== 'HANDLER');
  graph.relationships = graph.relationships.filter((e) => e.type !== 'RENDERS');
  graph.nodes.push(
    node('a1', 'HANDLER', 'a1', { actionType: 'demo.A', module: '/admin' }),
    node('a2', 'HANDLER', 'a2', { actionType: 'demo.B', module: '/admin' }),
    node('m1', 'HANDLER', 'm1', { actionType: 'demo.C', module: '/shop' }),
  );
  graph.relationships.push(
    edge('f1', 'FORWARDS_TO', 'a1', 'list'),
    edge('f2', 'FORWARDS_TO', 'a2', 'edit'),
    edge('f3', 'FORWARDS_TO', 'm1', 'about'),
  );
  for (const n of graph.nodes)
    if (n.id === 'vets' || n.id === 'vet') n.attributes.tilesDefinitionName = 'vet.page.' + n.id;
  const list = f.features(graph);
  assert.deepEqual(
    list.map((x) => [x.key, x.screens]),
    [
      ['module:/admin', ['edit', 'list']],
      ['tiles:vet.page', ['vet', 'vets']],
      ['other', ['done', 'about']],
    ],
  );
  // A loop with no entry starts from its first screen by name.
  graph.relationships.push(
    edge('loop', 'NAVIGATES_TO', 'to-vet', 'vets'),
    edge('c9', 'CONTAINS', 'vet', 'to-vet'),
  );
  graph.relationships = graph.relationships.filter((e) => e.id !== 'c4');
  graph.relationships.push(edge('c4', 'CONTAINS', 'vets', 'to-vet'));
  assert.deepEqual(f.features(graph)[1].flows, [{ entry: 'vet', screens: ['vet', 'vets'] }]);
});

test('R78 a feature decision is inherited by screens without their own, and by their components and APIs', async () => {
  const r = await ownModule('shared/review'),
    data = featureFixture();
  let state = r.emptyReview(data.graph, data.fingerprint);
  state = r.setFeature(state, 'class:demo.OwnerController', 'REMOVE');
  state = r.setScreen(state, 'list', 'KEEP');
  assert.equal(r.effectiveScreen(data.graph, state, 'edit'), 'REMOVE');
  assert.equal(r.screenInherited(data.graph, state, 'edit'), true);
  assert.equal(r.effectiveScreen(data.graph, state, 'list'), 'KEEP');
  assert.equal(r.screenInherited(data.graph, state, 'list'), false);
  assert.equal(r.effectiveComponent(state, 'edit', 'name', data.graph), 'INHERITED_REMOVE');
  // Without the graph, the explicit-only reading is unchanged.
  assert.equal(r.effectiveComponent(state, 'edit', 'name'), 'UNDECIDED');
  assert.equal(r.deriveApiUsage(data.graph, state).get('save').status, 'REMOVABLE');
  const counts = r.statistics(data.graph, state);
  assert.deepEqual(counts.screens, { UNDECIDED: 3, KEEP: 1, REMOVE: 2 });
  assert.equal(counts.screensInherited, 2);
  // The kept list screen leads to an inherited-removed screen: a conflict when its trigger is kept.
  assert.throws(() => r.setFeature(state, 'x', 'NO'), /無效/);
  state = r.setDecisionNote(state, 'feature', 'class:demo.OwnerController', {
    reason: 'REPLACED',
    note: '飼主功能改由新系統提供',
  });
  const restored = r.validateReview(
    JSON.parse(JSON.stringify(state)),
    data.graph,
    data.fingerprint,
  );
  assert.equal(r.featureDecision(restored, 'class:demo.OwnerController'), 'REMOVE');
  assert.equal(
    r.decisionNoteOf(restored, 'feature', 'class:demo.OwnerController').note,
    '飼主功能改由新系統提供',
  );
});

test('R78 md format 5 carries feature decisions and notes, round-trips, and lists unknown features as orphans', async () => {
  const r = await ownModule('shared/review'),
    m = await ownModule('shared/review-md'),
    data = featureFixture(),
    opts = { generatedAt: '2026-11-17T00:00:00.000Z', toolVersion: 'test' };
  let state = r.setFeature(r.emptyReview(data.graph, data.fingerprint), 'url:/vets', 'REMOVE');
  state = r.setDecisionNote(state, 'feature', 'url:/vets', {
    reason: 'DISCONTINUED',
    note: '獸醫功能停用',
  });
  const md = await m.generateMarkdown(data, state, opts),
    machine = JSON.parse(md.split('```json screentrace-review-state\n')[1].split('\n```')[0]);
  assert.equal(machine.format_version, 5);
  assert.deepEqual(machine.feature_decisions, { 'url:/vets': 'REMOVE' });
  assert.deepEqual(machine.decision_notes.features, {
    'url:/vets': { reason: 'DISCONTINUED', note: '獸醫功能停用' },
  });
  assert.match(
    md,
    /### 8\.1 \[REMOVE\]\n\n\| 功能 key \| 名稱 \| 分組依據 \| 依據值 \| 來源 \| 原因 \| 備註 \|/,
  );
  assert.match(md, /` 業務單位確認已停用（DISCONTINUED） ` \| ` 獸醫功能停用 ` \|/);
  // Screens without their own decision show the feature's, and say so.
  assert.match(
    md,
    /### 3\.\d+ \[REMOVE\]\n\n[^\n]+\n[^\n]+\n\| ` vets `[^\n]+\n\n未個別標記,隨所屬功能\(§8 功能 key ` url:\/vets `\)的決定 `REMOVE`/,
  );
  assert.match(md, /\| ` vets ` \| ` 獸醫清單 ` \| ` \/vets\/list ` \| REMOVE\(隨功能\) \|/);
  const imported = await m.importMarkdown(md, data);
  assert.deepEqual(imported.orphans, []);
  assert.equal(await m.generateMarkdown(data, imported.state, opts), md);
  const changed = structuredClone(data);
  changed.graph.nodes = changed.graph.nodes.filter((n) => n.id !== 'vet');
  changed.graph.relationships = changed.graph.relationships.filter(
    (e) => e.from !== 'vet' && e.to !== 'vet',
  );
  const again = await m.importMarkdown(md, changed);
  assert.deepEqual(again.orphans, [{ featureKey: 'url:/vets' }]);
  assert.equal(r.featureDecision(again.state, 'url:/vets'), 'REMOVE');
});

test('R78 md §9–§11: backend calls, field mapping and removal impact come from the graph only', async () => {
  const r = await ownModule('shared/review'),
    m = await ownModule('shared/review-md'),
    data = featureFixture();
  let state = r.setScreen(r.emptyReview(data.graph, data.fingerprint), 'vet', 'REMOVE');
  state = r.setApi(state, 'save', 'REMOVE');
  const md = await m.generateMarkdown(data, state, {
    generatedAt: '2026-11-17T00:00:00.000Z',
    toolVersion: 'test',
  });
  const section = (n) => md.split(`## ${n}.`)[1].split('\n## ')[0];
  assert.match(
    section(9),
    /\| ` OwnerController\.list\(\) ` \| 2 \| ` OwnerService#find ` \| ` Cache#get ` \| ` CLASS ` \| ` AMBIGUOUS ` ` 2 個實作 ` \| ` src\/OwnerService\.java:6 ` \|/,
  );
  assert.match(section(9), /` OwnerDao#query ` \| ` DAO ` \(` @Repository `\) \| ` CONFIRMED `/);
  assert.match(
    section(10),
    /\| ` edit ` \| ` name ` \| ` lastName ` \| ` ownerForm: String ` \| ` POST \/owners\/save ` \| ` lastName: String \(FORM\) ` \| ` required \(SERVER\) ` \|/,
  );
  const impact = section(11);
  assert.match(
    impact,
    /\| ` vet ` \| 畫面 \| 仍保留的畫面會連到此畫面 \| ` vets ` \| ` to-vet ` \|/,
  );
  assert.match(
    impact,
    /\| ` vet ` \| 畫面 \| 共用樣板仍被保留的畫面使用,不可一併刪除 \| ` header ` \| 1 個畫面 \|/,
  );
  assert.match(
    impact,
    /\| ` save ` \| API \| 仍保留的呼叫來源會失去此 API \| ` edit \/ form ` \| — \|/,
  );
  assert.match(
    impact,
    /\| ` save ` \| API \| 處理程式只服務此 API \| ` OwnerController\.edit\(\) ` \| — \|/,
  );
  // Malformed backend data is left out, never guessed at.
  const broken = structuredClone(data);
  broken.graph.nodes.find((n) => n.id === 'owner-c').attributes.backendCalls = '{not json';
  assert.match(
    await m.generateMarkdown(broken, r.emptyReview(broken.graph, broken.fingerprint), {
      generatedAt: '2026-11-17T00:00:00.000Z',
    }),
    /未偵測到處理程式呼叫專案內的 Service \/ DAO。/,
  );
});

test('R78 the migration target is the default, the analyst setting, or left out', async () => {
  const r = await ownModule('shared/review'),
    m = await ownModule('shared/review-md'),
    data = featureFixture(),
    state = r.emptyReview(data.graph, data.fingerprint),
    opts = { generatedAt: '2026-11-17T00:00:00.000Z' };
  assert.match(
    await m.generateMarkdown(data, state, opts),
    /migration_target:\n {2}backend: "Spring Boot 4"\n {2}frontend: "Angular"\n---/,
  );
  assert.match(
    await m.generateMarkdown(
      { ...data, migrationTarget: { backend: 'Quarkus', frontend: 'React <x>' } },
      state,
      opts,
    ),
    /migration_target:\n {2}backend: "Quarkus"\n {2}frontend: "React \\u003cx\\u003e"\n---/,
  );
  const none = await m.generateMarkdown({ ...data, migrationTarget: null }, state, opts);
  assert.doesNotMatch(none, /migration_target/);
  assert.equal((await m.importMarkdown(none, data)).orphans.length, 0);
});
