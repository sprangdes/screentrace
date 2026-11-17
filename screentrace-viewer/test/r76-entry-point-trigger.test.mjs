import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
import { fixture, node } from './fixture.mjs';

function graphWithEntryPointTrigger(schemaVersion) {
  const { graph } = fixture();
  graph.schemaVersion = schemaVersion;
  graph.relationships = [];
  graph.nodes.push(node('entry', 'ENTRY_POINT', '進入點', { path: '/business' }));
  graph.behaviors = [
    {
      id: 'load',
      event: 'load',
      type: 'CALL_API',
      triggerId: 'entry',
      targetId: 'ep',
      evidence: [
        {
          source: { file: 'web/entry.jsp', line: 1 },
          parser: 'Fixture',
          resolution: 'CONFIRMED',
          detail: 'fixture',
        },
      ],
    },
  ];
  return graph;
}

test('R76 entry point triggers are accepted for audience schemas 2.3 and 2.4', async () => {
  const module = await ownModule('shared/strict-graph');
  for (const version of ['2.3', '2.4']) {
    const graph = graphWithEntryPointTrigger(version);
    assert.equal(module.strictGraph(graph), graph);
  }
});

test('R76 entry point triggers are still rejected for schema 2.2', async () => {
  const module = await ownModule('shared/strict-graph');
  assert.throws(() => module.strictGraph(graphWithEntryPointTrigger('2.2')), /觸發者/);
});
