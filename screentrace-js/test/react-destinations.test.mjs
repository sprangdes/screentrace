import {test} from 'node:test';import assert from 'node:assert/strict';import {analyzeReact} from '../react/analyzer.mjs';
const router=`import {Routes,Route,Navigate,useNavigate} from 'react-router-dom';`;
const resolver=`export function destination(subject, fallback){if(subject.rotate)return {path:'/rotate'};if(fallback)return {path:fallback};if(subject.level==='CURATOR')return {path:'/desk'};return {path:'/browse'};}`;
const run=code=>analyzeReact({files:[{file:'src/destination.ts',code:resolver},{file:'src/App.tsx',code:router+`import {destination} from './destination';`+code}]});
const effects=s=>[...s.load,...s.components.flatMap(c=>c.behaviors)];
const routes=`<Route path="/rotate" element={<p/>}/><Route path="/desk" element={<p/>}/><Route path="/browse" element={<p/>}/>`;
test('WP80 returned path objects expand constants with return evidence and keep a parameter branch unresolved',()=>{
 const r=run(`function Login(){const go=useNavigate();return <button onClick={()=>go(destination(person,returnTo).path)}>Enter</button>;}
 function App(){return <Routes><Route path="/enter" element={<Login/>}/>${routes}</Routes>;}`);
 const nav=effects(r.screens.find(s=>s.route==='/enter')).filter(b=>b.type==='NAVIGATE');
 assert.deepEqual(nav.flatMap(b=>b.urls).sort(),['/browse','/desk','/rotate']);
 assert.ok(nav.some(b=>!b.urls.length&&b.status==='UNRESOLVED'));
 assert.ok(nav.filter(b=>b.urls.length).every(b=>b.status==='INFERRED'&&b.trace.some(t=>t.source.file==='src/destination.ts')));
});
test('WP80 handler fall-through facts filter only contradictory returned destinations',()=>{
 const r=run(`function Change(){const go=useNavigate();const save=()=>{if(!person || person.rotate)return;const next=destination(person);go(next.path);};return <button onClick={save}>Save</button>;}
 function App(){return <Routes><Route path="/change" element={<Change/>}/>${routes}</Routes>;}`);
 const nav=effects(r.screens.find(s=>s.route==='/change')).filter(b=>b.type==='NAVIGATE');
 assert.ok(nav.some(b=>b.urls.includes('/desk')));assert.ok(!nav.some(b=>b.urls.includes('/rotate')));
});
test('WP80 Navigate guard and direct string-returning function retain branch conditions',()=>{
 const r=run(`function direct(subject){if(subject.level==='CURATOR')return '/desk';return '/browse';}
 function Guard(){if(person.rotate)return <Navigate to={destination(person).path}/>;return <Navigate to={direct(person)}/>;}
 function App(){return <Routes><Route path="/gate" element={<Guard/>}/>${routes}</Routes>;}`);
 const nav=effects(r.screens.find(s=>s.route==='/gate')).filter(b=>b.type==='NAVIGATE');
 assert.ok(nav.some(b=>b.urls.includes('/rotate')));assert.ok(nav.some(b=>b.urls.includes('/browse')));
 assert.ok(nav.filter(b=>b.urls.length).every(b=>b.guard));
});
