import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';

test('R32 a split share stays inside its range, to a tenth of a percent', async () => {
  const s = await ownModule('splitter'),
    range = { initial: 30, min: 20, max: 50 };
  assert.equal(s.clampSplit(33.333, range), 33.3);
  assert.equal(s.clampSplit(5, range), 20);
  assert.equal(s.clampSplit(80, range), 50);
});

test('R32 a pointer sets the share of the left column from the left edge and of the right column from the right edge', async () => {
  const s = await ownModule('splitter'),
    range = { initial: 30, min: 20, max: 50 };
  assert.equal(s.splitAt(400, 100, 1000, 'start', range), 30, '300px of 1000 from the left');
  assert.equal(s.splitAt(700, 100, 1000, 'end', range), 40, '400px of 1000 from the right');
  assert.equal(s.splitAt(1050, 100, 1000, 'start', range), 50, 'past the max');
  assert.equal(s.splitAt(400, 100, 0, 'start', range), 30, 'no width gives the initial share');
});

test('R32 the API list starts at 30% and the persona side column at 28%', async () => {
  const api = await ownModule('api-page'),
    persona = await ownModule('persona-page');
  assert.deepEqual(api.API_SPLIT, { initial: 30, min: 20, max: 50 });
  assert.deepEqual(persona.PERSONA_SPLIT, { initial: 28, min: 20, max: 45 });
  assert.deepEqual(
    (await ownModule('splitter')).LIST_SPLIT,
    { initial: 18, min: 14, max: 35 },
    'the screen list is 18% of the window',
  );
});
