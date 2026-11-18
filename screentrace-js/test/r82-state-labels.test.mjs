import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStateLabels } from '../react/state-labels.mjs';

test('R82 frontend label groups: object maps, value/label arrays and select options', () => {
  const { groups } = analyzeStateLabels({
    files: [
      {
        file: 'src/status.ts',
        code: `export const STATUS = {
  PENDING: { key: 'PENDING', label: '待確認', icon: 'hourglass' },
  DONE: { key: 'DONE', label: '已完成' },
};
const icons = { PENDING: 'bi-clock', DONE: 'bi-check' };
const flat = { PENDING: '等待中', DONE: \`完成\` };
const one = { PENDING: '只有一個' };`,
      },
      {
        file: 'src/Filter.tsx',
        code: `const options = [{ value: 'PENDING', label: '待確認' }, { value: 'DONE', label: '已完成' }];
export function F() {
  return <select><option value="">全部</option><option value="PENDING">等待店家確認</option><option value="DONE">已完成</option></select>;
}
export function G(x) {
  return <select><option value="PENDING">{x}</option><option value="DONE">已完成</option></select>;
}`,
      },
    ],
  });
  assert.deepEqual(
    groups.map((g) => [g.source.file, g.source.line, g.entries]),
    [
      ['src/Filter.tsx', 1, { DONE: '已完成', PENDING: '待確認' }],
      ['src/Filter.tsx', 3, { DONE: '已完成', PENDING: '等待店家確認' }],
      ['src/status.ts', 1, { DONE: '已完成', PENDING: '待確認' }],
      ['src/status.ts', 6, { DONE: '完成', PENDING: '等待中' }],
    ],
  );
});
