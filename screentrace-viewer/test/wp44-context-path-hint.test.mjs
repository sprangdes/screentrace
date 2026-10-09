import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';

test('CONTEXT_PATH_HINT has a Chinese diagnostics label for the analysis information drawer', async () => {
  const diagnostics = await ownModule('diagnostics');
  assert.equal(diagnostics.diagnosticName('CONTEXT_PATH_HINT'), '網址可能缺少部署前綴');
});
