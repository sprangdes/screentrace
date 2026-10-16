import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const css=await readFile(new URL('../src/viewer.css',import.meta.url),'utf8');
const rule=selector=>css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\{([^}]*)\\}`))?.[1];

test('right-panel rows: gray on hover, the preview\'s yellow when marked, across the whole row',()=>{
 assert.match(rule('.button-row:hover'),/background:var\(--gray-50\)/);
 assert.match(rule('.link-row:hover'),/background:var\(--gray-50\)/);
 assert.match(rule('.button-row.is-highlighted'),/background:#fef9c3/);
 assert.match(rule('.button-row.is-highlighted'),/#eab308/,'the marked row uses the same yellow as the frame in the preview');
 // The button text inside a row draws no state of its own, so the colored area is always the full row.
 assert.match(rule('.button-info:hover'),/background:none/);
 assert.match(rule('.button-info:focus-visible'),/outline:0/);
 assert.ok(!/\.button-row:focus-within/.test(css),'a mouse click must not tint the row blue');
});
