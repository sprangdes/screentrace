import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ownModule} from './module.mjs';

test('R14 design typography and color tokens match section 8.3',async()=>{
 const css=await readFile(new URL('../src/viewer.css',import.meta.url),'utf8');
 for(const token of [
  '--gray-50:#F6F6F3','--gray-100:#FAFAF8','--gray-200:#E2E3DF','--gray-300:#D5D7D2',
  '--gray-500:#5B6168','--gray-700:#3A3F45','--gray-900:#1B1E22','--primary:#2347C5',
  '--primary-soft:#EBEEF8','--keep:#1D6B45','--remove:#9E3410','--undecided:#7A5000',
  '--inferred:#4A63C9','--font-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace',
  'font-family:"PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif'
 ]) assert.ok(css.includes(token),`missing design token ${token}`);
 assert.doesNotMatch(css,/fonts\.googleapis\.com|fonts\.gstatic\.com|https?:\/\//i);
});

test('R14 WP45 entry terminology follows the approved vocabulary exactly',async()=>{
 const {entryClassLabel}=await ownModule('inventory');
 assert.equal(entryClassLabel('HAS_ENTRY'),'有入口的畫面');
});
