import test from 'node:test';import assert from 'node:assert/strict';import {analyzeReact} from '../react/analyzer.mjs';
const run=body=>analyzeReact({files:[{file:'src/App.tsx',code:`import {Routes,Route} from 'react-router-dom';import {useEffect,useState} from 'react';const api={alpha:()=>fetch('/api/alpha'),beta:()=>fetch('/api/beta')};${body}`} ]});
const calls=s=>[...s.load,...s.components.flatMap(c=>c.behaviors)].filter(e=>e.type==='CALL_API');
for(const [name,statement,expected,status]of [
 ['Object.keys map','Object.keys(table).map(k=>table[k]())',['/api/alpha','/api/beta'],'CONFIRMED'],
 ['for in','for(const k in table){table[k]()}',['/api/alpha','/api/beta'],'CONFIRMED'],
 ['unknown key','table[selected]()',['/api/alpha','/api/beta'],'INFERRED'],
 ['literal key',`table['left']()`,['/api/alpha'],'CONFIRMED']])test('WP81 dispatch '+name,()=>{
 const result=run(`function Page(){useEffect(()=>{const table={left:api.alpha,right:api.beta};${statement}},[]);return <p/>;}function App(){return <Routes><Route path="/" element={<Page/>}/></Routes>;}`);
 const effects=calls(result.screens[0]);assert.deepEqual([...new Set(effects.flatMap(e=>e.urls))].sort(),expected);assert.ok(effects.every(e=>e.status===status));assert.ok(effects.every(e=>e.trace.some(t=>t.dispatch&&t.source.file==='src/App.tsx')));
});
test('WP81 more than twenty dispatch entries stay unresolved with a diagnostic',()=>{
 const properties=Array.from({length:21},(_,i)=>`k${i}:api.alpha`).join(',');const r=run(`function Page(){useEffect(()=>{const table={${properties}};table[selected]()},[]);return <p/>;}function App(){return <Routes><Route path="/" element={<Page/>}/></Routes>;}`);assert.equal(calls(r.screens[0]).length,0);assert.ok(r.diagnostics.some(d=>d.code==='REACT_DISPATCH_TABLE_TOO_LARGE'));
});
test('WP81 handler and load branches use literal props while state initializers remain unknown',()=>{
 const r=run(`function Editor({revising}){const [toggle,setToggle]=useState(false);function save(){if(revising){api.beta()}else{api.alpha()}revising?fetch('/api/edit'):fetch('/api/add');revising&&fetch('/api/only-edit');if(toggle)fetch('/api/state-yes');else fetch('/api/state-no');}useEffect(()=>{if(revising)fetch('/api/load-edit');else fetch('/api/load-add')},[]);return <button onClick={save}>Save</button>;}function App(){return <Routes><Route path="/new" element={<Editor revising={false}/>}/><Route path="/edit" element={<Editor revising/>}/></Routes>;}`);
 for(const [route,expected]of [['/new',['/api/add','/api/alpha','/api/load-add','/api/state-no','/api/state-yes']],['/edit',['/api/beta','/api/edit','/api/load-edit','/api/only-edit','/api/state-no','/api/state-yes']]])assert.deepEqual([...new Set(calls(r.screens.find(s=>s.route===route)).flatMap(e=>e.urls))].sort(),expected);
});
test('WP81 runtime event and unresolved callback arguments are not missing literal arguments',()=>{
 const r=run(`function Page(){function click(evt){if(evt)fetch('/api/event');else fetch('/api/no-event');}useEffect(()=>{unknownList.forEach(value=>{if(value)fetch('/api/value');else fetch('/api/no-value')})},[]);return <button onClick={click}>Click</button>;}function App(){return <Routes><Route path="/" element={<Page/>}/></Routes>;}`);assert.deepEqual([...new Set(calls(r.screens[0]).flatMap(e=>e.urls))].sort(),['/api/event','/api/no-event','/api/no-value','/api/value']);
});
