import { mdFixture } from './md-fixture.mjs';
import { node } from './fixture.mjs';
/** The md fixture with an input field on screen a, and a review using every R77 mark. */
export async function v4Case(r) {
  const data = mdFixture();
  data.graph.nodes.push(node('name', 'COMPONENT', '姓名', { kind: 'TEXT_INPUT', tag: 'input' }));
  data.graph.relationships.push({
    id: 'name-edge',
    type: 'CONTAINS',
    from: 'a',
    to: 'name',
    confidence: 'CONFIRMED',
    source: { file: 'web/a.jsp', line: 5 },
    evidence: [
      { parser: 'Fixture', resolution: 'CONFIRMED', source: { file: 'web/a.jsp', line: 5 } },
    ],
  });
  let state = r.emptyReview(data.graph, data.fingerprint);
  state = r.setScreen(state, 'b', 'REMOVE');
  state = r.setDecisionNote(state, 'screen', 'b', {
    reason: 'DISCONTINUED',
    note: '舊版功能，已併入甲畫面',
  });
  state = r.setComponent(state, 'a', 'name', 'KEEP');
  state = r.setDecisionNote(state, 'component', 'a', 'name', { note: '改成必填' });
  state = r.setApi(state, 'ep', 'REMOVE');
  state = r.setDecisionNote(state, 'api', 'ep', { reason: 'REPLACED', note: '改用新版查詢 API' });
  state = r.setApi(state, 'unused', 'KEEP');
  state = r.setDecisionNote(state, 'api', 'unused', { reason: 'COMPLIANCE' });
  return { data, state };
}
