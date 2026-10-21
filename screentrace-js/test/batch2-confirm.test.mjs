import test from 'node:test';import assert from 'node:assert/strict';import {analyze} from '../analyzer.mjs';
test('return confirm preserves cancellation semantics, standalone confirm does not gate default action',()=>{
 const run=code=>analyze({sources:[{file:'view.jsp',screenId:'s',triggerId:'delete',event:'click',code}],dom:[]});
 const b=run("return confirm('Delete?');").behaviors[0];
 assert.equal(b.operation,'confirm');assert.equal(b.cancelsDefault,true);assert.equal(b.message,'Delete?');assert.equal(b.status,'CONFIRMED');
 assert.equal(run("confirm('Info');").behaviors[0].operation,'message');
 assert.ok(!run("function ask(){return confirm('Ignored return');} ask();").behaviors.some(b=>b.operation==='confirm'));
 assert.ok(!run("function confirm(){return true;} return confirm('Local');").behaviors.some(b=>b.operation==='confirm'));
});
