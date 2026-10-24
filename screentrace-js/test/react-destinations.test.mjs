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
test('R18 correction: conditional URL and parameter path obey the source audience',()=>{
 const r=run(`function choose(level){if(level==='CURATOR')return '/desk';return '/browse';}
 function Access({children}){if(person?.level==='CURATOR')return null;return children;} function Reader(){const go=useNavigate();return <><button onClick={()=>go(person?.level==='CURATOR'?'/desk':'/browse')}>Ternary</button><button onClick={()=>go(choose(person?.level))}>Function</button><button onClick={()=>go(choose(unknownLevel()))}>Unknown</button></>;}
 function App(){return <Routes><Route path="/reader" element={<Access><Reader/></Access>}/>${routes}</Routes>;}`);
 const buttons=r.screens.find(s=>s.route==='/reader').components;
 for(const label of ['Ternary','Function'])assert.deepEqual(buttons.find(c=>c.label===label).behaviors.flatMap(b=>b.urls).sort(),['/browse']);
 assert.deepEqual(buttons.find(c=>c.label==='Unknown').behaviors.flatMap(b=>b.urls).sort(),['/browse','/desk']);
});
test('R18 correction: router Link resolves a local path function with the actual identity argument',()=>{
 const r=run(`import {Link} from 'react-router-dom';function choose(tier){return tier==='CURATOR'?'/desk':'/browse';}function Access({children}){if(person?.level==='CURATOR')return null;return children;}function Reader(){const next=choose(person?.level);return <Link to={next}>Settings</Link>;}function App(){return <Routes><Route path='/reader' element={<Access><Reader/></Access>}/>${routes}</Routes>;}`);
 assert.deepEqual(effects(r.screens.find(s=>s.route==='/reader')).flatMap(b=>b.urls),['/browse']);
});
test('R18 unknown argument expressions do not acquire identity from equal source text',()=>{
 const r=run(`function choose(level){return level==='CURATOR'?'/desk':'/browse';}function Access({children}){if(readTier()==='CURATOR')return null;return children;}function Reader(){const go=useNavigate();return <button onClick={()=>go(choose(readTier()))}>Unknown</button>;}function App(){return <Routes><Route path='/reader' element={<Access><Reader/></Access>}/>${routes}</Routes>;}`);
 assert.deepEqual(effects(r.screens.find(s=>s.route==='/reader')).flatMap(b=>b.urls).sort(),['/browse','/desk']);
});
