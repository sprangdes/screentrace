// R79 (ADR 0157): display fields pass the md's strict graph check and count as fields.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
import { mdFixture } from './md-fixture.mjs';
import { node } from './fixture.mjs';

test('R79 a display field reaches the md: strict check, field statistics and §10 by property', async () => {
  const r = await ownModule('shared/review'),
    m = await ownModule('shared/review-md'),
    data = mdFixture();
  data.graph.nodes.push(
    node('city', 'COMPONENT', '城市', {
      kind: 'DISPLAY_FIELD',
      tag: 'td',
      expression: '${owner.city}',
      property: 'owner.city',
      displayName: '城市',
    }),
    node('owner', 'FORM_MODEL', 'owner', { 'field.city.type': 'String' }),
  );
  data.graph.relationships.push({
    id: 'c-city',
    type: 'CONTAINS',
    from: 'a',
    to: 'city',
    confidence: 'CONFIRMED',
    source: { file: 'web/a.jsp', line: 6 },
    evidence: [
      { parser: 'Fixture', resolution: 'CONFIRMED', source: { file: 'web/a.jsp', line: 6 } },
    ],
  });
  const state = r.setComponent(r.emptyReview(data.graph, data.fingerprint), 'a', 'city', 'KEEP');
  assert.deepEqual(r.statistics(data.graph, state).fields, { UNDECIDED: 0, KEEP: 1, REMOVE: 0 });
  const md = await m.generateMarkdown(data, state, { generatedAt: '2026-11-17T00:00:00.000Z' });
  assert.match(md, /\| 欄位 \| 1 \| 0 \| 0 \|/);
  assert.match(md, /\| ` a ` \| ` city ` \| ` owner\.city ` \| ` owner: String ` \|/);
});
