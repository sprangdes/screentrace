import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';

test('WP42 display labels follow the evidence priority and humanize only proven fields',async()=>{
 const {componentLabel}=await ownModule('labels');
 const base={id:'search-owner-form',name:'search-owner-form',type:'COMPONENT',attributes:{kind:'FORM'}};
 assert.equal(componentLabel({...base,attributes:{...base.attributes,visibleText:'Find Owners'}}),'Find Owners');
 assert.equal(componentLabel({...base,attributes:{...base.attributes,'aria-label':'Accessible'}}),'Accessible');
 assert.equal(componentLabel({...base,attributes:{...base.attributes,title:'Title'}}),'Title');
 assert.equal(componentLabel({...base,attributes:{...base.attributes,alt:'Brand'}}),'Brand');
 assert.equal(componentLabel({...base,attributes:{kind:'BUTTON',tag:'input',value:'Search'}}),'Search');
 assert.equal(componentLabel(base,{formHeading:'Find Owners'}),'Find Owners 表單');
 assert.equal(componentLabel(base),'Search Owner Form 表單');
 assert.equal(componentLabel({id:'save-owner',name:'save-owner',type:'COMPONENT',attributes:{kind:'BUTTON'}}),'Save Owner 按鈕');
 assert.equal(componentLabel({...base,name:'',id:'icon-button',attributes:{kind:'BUTTON',tag:'button'}},{ancestors:[{tag:'nav'}]}),'按鈕（位於 導覽列）');
 assert.equal(componentLabel({...base,name:'',id:'',attributes:{kind:'BUTTON',tag:'button',class:'navbar-toggler'}},{ancestors:[{tag:'nav'}]}),'按鈕（位於 導覽列）');
 assert.equal(componentLabel({...base,name:'',id:'',attributes:{kind:'BUTTON',tag:'button'}}),'按鈕（無文字）');
 assert.equal(componentLabel({...base,attributes:{...base.attributes,visibleText:'Save'}},{duplicateOrdinal:2,duplicateCount:2}),'Save（第 2 個）');
 assert.equal(componentLabel({...base,attributes:{...base.attributes,visibleText:'Owner'}},{knownDestination:'Owner Details'}),'Owner，前往 Owner Details');
});

test('WP42 source vocabulary variants stay out of viewer code outside the terms dictionary',async()=>{
 const {readFile,readdir}=await import('node:fs/promises');
 const {resolve,join}=await import('node:path');
 const root=resolve(new URL('../src/',import.meta.url).pathname);
 const walk=async dir=>(await Promise.all((await readdir(dir,{withFileTypes:true})).map(entry=>entry.isDirectory()?walk(join(dir,entry.name)):entry.name.endsWith('.ts')?[join(dir,entry.name)]:[]))).flat();
 const files=await walk(root),violations=[];
 for(const file of files){if(file.endsWith('/terms.ts'))continue;const source=await readFile(file,'utf8');for(const phrase of ['靜態推定','已由來源確認','依證據推定'])if(source.includes(phrase))violations.push(`${file}: ${phrase}`);}
 assert.deepEqual(violations,[],'status and confidence wording must be centralized');
});
