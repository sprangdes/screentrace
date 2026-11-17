// R77 (ADR 0155): fields, tables and APIs can be marked; every markable item can carry a note.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
import { fixture, node } from './fixture.mjs';

/** The shared fixture plus one text field and one table on screen a, and a caller for `ep`. */
function fieldFixture() {
  const data = fixture();
  data.graph.nodes.push(
    node('name', 'COMPONENT', '姓名', { kind: 'TEXT_INPUT', tag: 'input', type: 'text' }),
    node('list', 'COMPONENT', '清單', { kind: 'TABLE', tag: 'table' }),
    node('pick', 'COMPONENT', '類別', { kind: 'SELECT', tag: 'select' }),
  );
  data.graph.relationships.push(
    { id: 'f1', type: 'CONTAINS', from: 'a', to: 'name' },
    { id: 'f2', type: 'CONTAINS', from: 'a', to: 'list' },
    { id: 'f3', type: 'CONTAINS', from: 'a', to: 'pick' },
    { id: 'f4', type: 'CALLS', from: 'shared', to: 'ep' },
  );
  // A select that navigates was already markable through its trigger; it now counts as a field.
  data.graph.relationships.push({ id: 'f5', type: 'NAVIGATES_TO', from: 'pick', to: 'b' });
  return data;
}

test('R77 input fields and tables are markable, counted apart from buttons and inherit a removed screen', async () => {
  const m = await ownModule('shared/review'),
    data = fieldFixture();
  assert.deepEqual(m.fieldComponents(data.graph), [
    { screenId: 'a', componentId: 'list' },
    { screenId: 'a', componentId: 'name' },
    { screenId: 'a', componentId: 'pick' },
  ]);
  const markable = m.markableComponents(data.graph).map((k) => `${k.screenId}/${k.componentId}`);
  for (const key of ['a/name', 'a/list', 'a/pick', 'a/shared', 'b/shared'])
    assert.ok(markable.includes(key), key);
  let state = m.emptyReview(data.graph, data.fingerprint);
  state = m.setComponent(state, 'a', 'name', 'KEEP');
  state = m.setComponent(state, 'a', 'list', 'REMOVE');
  let counts = m.statistics(data.graph, state);
  assert.deepEqual(counts.fields, { UNDECIDED: 1, KEEP: 1, REMOVE: 1 });
  // Buttons are counted as before: fields never enter the button numbers.
  assert.deepEqual(counts.components, { UNDECIDED: 2, KEEP: 0, REMOVE: 0 });
  state = m.setScreen(state, 'a', 'REMOVE');
  counts = m.statistics(data.graph, state);
  assert.equal(counts.fieldsInherited, 3);
  assert.equal(m.effectiveComponent(state, 'a', 'pick'), 'INHERITED_REMOVE');
  assert.equal(m.componentDecision(state, 'a', 'name'), 'KEEP');
});

test('R77 an API decided directly sits beside its derived status, and disagreements are conflicts', async () => {
  const m = await ownModule('shared/review'),
    data = fieldFixture();
  let state = m.emptyReview(data.graph, data.fingerprint);
  assert.equal(m.apiDecision(state, 'ep'), 'UNDECIDED');
  assert.throws(() => m.setApi(state, 'ep', 'MAYBE'), /無效/);
  // Removed while a kept-by-default caller remains: a conflict, nothing is corrected.
  state = m.setApi(state, 'ep', 'REMOVE');
  assert.equal(m.deriveApiUsage(data.graph, state).get('ep').status, 'IN_USE');
  assert.deepEqual(m.apiConflicts(data.graph, state), [
    { apiId: 'ep', decision: 'REMOVE', derived: 'IN_USE' },
  ]);
  // An API with no callers removed by a person is exactly what direct marks are for: no conflict.
  state = m.setApi(state, 'unused', 'REMOVE');
  assert.equal(
    m.apiConflicts(data.graph, state).some((c) => c.apiId === 'unused'),
    false,
  );
  // Kept although every caller is removed.
  state = m.setApi(state, 'ep', 'KEEP');
  state = m.setScreen(m.setScreen(state, 'a', 'REMOVE'), 'b', 'REMOVE');
  assert.equal(m.deriveApiUsage(data.graph, state).get('ep').status, 'REMOVABLE');
  assert.deepEqual(m.apiConflicts(data.graph, state), [
    { apiId: 'ep', decision: 'KEEP', derived: 'REMOVABLE' },
  ]);
  assert.deepEqual(m.statistics(data.graph, state).apis, { UNDECIDED: 0, KEEP: 1, REMOVE: 1 });
});

test('R77 notes on screens, components and APIs: reasons follow the decision, text is sanitized and kept', async () => {
  const m = await ownModule('shared/review'),
    data = fieldFixture();
  let state = m.emptyReview(data.graph, data.fingerprint);
  // A note can be written before deciding; a reason needs a decision it fits.
  state = m.setDecisionNote(state, 'component', 'a', 'name', { note: '改成必填\n並限制 20 字' });
  assert.equal(m.decisionNoteOf(state, 'component', 'a', 'name').note, '改成必填 並限制 20 字');
  state = m.setApi(state, 'ep', 'REMOVE');
  assert.throws(() => m.setDecisionNote(state, 'api', 'ep', { reason: 'IN_USE' }), /原因/);
  state = m.setDecisionNote(state, 'api', 'ep', { reason: 'REPLACED', note: '改用 /api/v2' });
  assert.deepEqual(m.decisionNoteOf(state, 'api', 'ep'), {
    reason: 'REPLACED',
    note: '改用 /api/v2',
  });
  // Switching to keep drops the reason that no longer fits and keeps the text.
  state = m.setApi(state, 'ep', 'KEEP');
  assert.deepEqual(m.decisionNoteOf(state, 'api', 'ep'), { note: '改用 /api/v2' });
  state = m.setScreen(state, 'b', 'REMOVE');
  state = m.setDecisionNote(state, 'screen', 'b', { reason: 'DISCONTINUED' });
  state = m.setScreen(state, 'b', 'UNDECIDED');
  // Undecided again: the reason stays in the page but does not leave it; text always does.
  assert.equal(m.decisionNoteOf(state, 'screen', 'b').reason, 'DISCONTINUED');
  assert.deepEqual(m.exportableNotes(state), {
    screens: {},
    components: { a: { name: { note: '改成必填 並限制 20 字' } } },
    apis: { ep: { note: '改用 /api/v2' } },
  });
  assert.throws(() => m.setDecisionNote(state, 'api', 'ep', { note: 'x'.repeat(1001) }), /1,000/);
  assert.throws(() => m.setDecisionNote(state, 'api', 'ep', { extra: 1 }), /格式錯誤/);
});

test('R77 API decisions and notes survive storage validation; IDs stay ordinary keys', async () => {
  const m = await ownModule('shared/review'),
    data = fieldFixture();
  let state = m.emptyReview(data.graph, data.fingerprint);
  state = m.setApi(state, '__proto__', 'REMOVE');
  state = m.setApi(state, 'ep', 'KEEP');
  state = m.setDecisionNote(state, 'api', '__proto__', { note: '未知 API' });
  state = m.setDecisionNote(state, 'component', '__proto__', 'constructor', { note: '未知元件' });
  const restored = m.validateReview(
    JSON.parse(JSON.stringify(state)),
    data.graph,
    data.fingerprint,
  );
  assert.equal(m.apiDecision(restored, '__proto__'), 'REMOVE');
  assert.equal(m.apiDecision(restored, 'ep'), 'KEEP');
  assert.equal(m.decisionNoteOf(restored, 'api', '__proto__').note, '未知 API');
  const notes = m.exportableNotes(restored);
  assert.ok(Object.hasOwn(notes.apis, '__proto__'));
  assert.ok(Object.hasOwn(notes.components, '__proto__'));
  assert.equal(Object.getPrototypeOf(notes.components), Object.prototype);
  assert.equal({}.constructor, Object);
  assert.throws(
    () =>
      m.validateReview(
        { ...JSON.parse(JSON.stringify(state)), apiDecisions: { ep: 'MAYBE' } },
        data.graph,
        data.fingerprint,
      ),
    /無效/,
  );
  assert.throws(
    () =>
      m.validateReview(
        {
          ...JSON.parse(JSON.stringify(state)),
          decisionNotes: { screens: {}, components: {}, apis: {}, extra: {} },
        },
        data.graph,
        data.fingerprint,
      ),
    /decisionNotes/,
  );
});
