import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {ownModule} from './module.mjs';import {mdFixture} from './md-fixture.mjs';
// R17: reports no longer export component-library overrides (format_version 2). golden/review-v2.md was produced by the
// pre-R17 generator; these tests keep such files importable with their strict field and integrity checks.
const opts={generatedAt:'2026-10-03T00:00:00.000Z',toolVersion:'test'};
const machine=md=>JSON.parse(md.split('```json screentrace-review-state\n')[1].split('\n```')[0]);
async function modify(m,md,edit){const data=machine(md);edit(data);delete data.state_sha256;data.state_sha256=await m.sha256(m.canonicalJson(data));return md.split('```json screentrace-review-state\n')[0]+'```json screentrace-review-state\n'+m.machineJson(data)+'\n```\n';}
const v2=()=>readFile(new URL('golden/review-v2.md',import.meta.url),'utf8');

test('earlier v2 files import their decisions, keep overrides only as lossless orphans, and re-export as v1 without them',async()=>{
 const m=await ownModule('shared/review-md'),data=mdFixture(),md=await v2();
 assert.equal(machine(md).format_version,2);
 const imported=await m.importMarkdown(md,data);
 assert.equal(imported.state.screenDecisions.a,'KEEP');
 assert.deepEqual(imported.state.orphan_component_overrides.map(o=>[o.screenId,o.componentId,o.libraryComponentId]),[['a','shared','sample-alt']]);
 const again=await m.generateMarkdown(data,imported.state,opts);
 assert.equal(machine(again).format_version,1);assert.deepEqual(machine(again).screen_decisions,{a:'KEEP'});
 assert.doesNotMatch(again,/sample-alt|component_overrides|元件庫/);
});

test('earlier v2 files keep their strict field and digest checks on import',async()=>{
 const m=await ownModule('shared/review-md'),data=mdFixture(),md=await v2();
 for(const edit of [x=>delete x.component_overrides,x=>delete x.orphan_component_overrides,x=>x.extra=true,x=>{x.format_version=1;},x=>{x.orphan_component_overrides=[{screenId:'a',componentId:'shared',libraryComponentId:'sample-alt',manifest_sha256:'A'.repeat(64)}];}])
  await assert.rejects(m.importMarkdown(await modify(m,md,edit),data));
 await assert.rejects(m.importMarkdown(md.replace('"KEEP"','"REMOVE"'),data));
});
