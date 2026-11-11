import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';

test('R33 an area preview names its first three screens and marks that there are more', async () => {
  const { areaPreview } = await ownModule('groups');
  assert.equal(areaPreview(['甲', '乙', '丙', '丁']), '甲、乙、丙…');
  assert.equal(areaPreview(['甲', '乙', '丙']), '甲、乙、丙');
  assert.equal(areaPreview(['甲', '', '乙']), '甲、乙', 'unnamed screens are skipped');
  assert.equal(areaPreview([]), '');
});
