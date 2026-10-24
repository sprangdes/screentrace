import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeReact} from '../react/analyzer.mjs';
import {atoms, contradicts, combinations} from '../react/audience.mjs';
const router = `import {Routes,Route,Navigate} from 'react-router-dom'; import {createRoot} from 'react-dom/client';`;
const run = code => analyzeReact({files:[{file:'src/App.tsx',code:router+code+';createRoot(document.getElementById("root")).render(<App/>);'}],markup:true});

test('WP78 nested and global guards carry source-proven facts, not component guard prefixes',()=>{
 const result=run(`
 function Paused({children}){if(working)return null;return children;}
 function Signed({children}){if(!account)return <Navigate to="/enter"/>;return children;}
 function Staff({children}){return account?.tier !== 'EDITOR' ? <Navigate to="/else"/> : children;}
 function Page(){return <button>Save</button>;}
 export function App(){return <Paused><Routes><Route path="/edit" element={<Signed><Staff><Page/></Staff></Signed>}/></Routes></Paused>;}`);
 const page=result.screens[0];
 assert.ok(page.audience.some(a=>a.text==='account' && a.truth));
 assert.ok(page.audience.some(a=>a.text===`account.tier === "EDITOR"` && a.truth));
 assert.ok(page.audience.some(a=>a.text==='working' && !a.truth));
 assert.ok(page.audience.every(a=>a.source.file==='src/App.tsx' && a.source.line>1));
 assert.equal(page.components[0].guard,null);
});

test('WP78 only specified contradictions prune; optional access, equality and De Morgan normalize',()=>{
 const a=expression=>atoms(expression,{file:'a.tsx',line:2});
 assert.ok(contradicts([...a('!actor'),...a(`actor?.rank === 'EDITOR'`)]));
 assert.ok(contradicts([...a('!actor'),...a('actor.rank')]));
 assert.ok(!contradicts([...a('!actor'),...a('!actor?.rank')]));
 assert.ok(contradicts([...a(`actor.rank === 'EDITOR'`),...a(`actor?.rank === 'READER'`)]));
 assert.ok(contradicts([...a('flag'),...a('!flag')]));
 assert.ok(!contradicts([...a('featureFlag'),...a(`actor.rank === 'READER'`)]));
 assert.ok(!contradicts([...a(`one().rank === 'CURATOR'`),...a(`two().rank === 'READER'`)]));
 assert.deepEqual(a('!(a || b)').map(x=>[x.text,x.truth]),[['a',false],['b',false]]);
 assert.ok(!contradicts(a('!(a && b)')));
});

test('WP78 renamed guard and identity fields, free conditions and bounded audience combinations',()=>{
 const result=run(`function Admission({children}){if(!visitor)return null;return children;}
 function Page(){return <>{featureFlag && <button>Optional</button>}<button>Always</button></>;}
 export function App(){return <Routes><Route path="/one" element={<Admission><Page/></Admission>}/></Routes>;}`);
 assert.deepEqual(result.screens[0].audience.map(a=>[a.text,a.truth]),[['visitor',true]]);
 assert.equal(result.screens[0].components.length,2);
 assert.ok(result.audiences.length>0);
 assert.equal(combinations(Array.from({length:5},(_,i)=>atoms(`flag${i}`,{file:'a',line:1}))).overflow,true);
});

test('WP78 audience overflow reaches diagnostics instead of disappearing during deduplication',()=>{
 const gates=Array.from({length:5},(_,i)=>`function Gate${i}({children}){if(!flag${i})return null;return children;}`).join('\n');
 const routes=Array.from({length:5},(_,i)=>`<Route path="/flag${i}" element={<Gate${i}><button>Go</button></Gate${i}>}/>`).join('');
 const result=run(`${gates} function App(){return <Routes>${routes}</Routes>;}`);
 assert.ok(result.diagnostics.some(d=>d.code==='REACT_AUDIENCE_TOO_MANY'));assert.equal(result.audiences.length,0);
});
test('R18 display removes implied disjunctions and duplicate atoms while retaining raw evidence',async()=>{
 const {simplify}=await import('../react/audience.mjs');const source={file:'src/Test.tsx',line:1};
 const raw=[...atoms('!account.rotate',source),...atoms('!account.rotate || path === "/rotate"',source),...atoms('!account.rotate',source),...atoms('otherAllowed(path)',source)];
 assert.deepEqual(simplify(raw).map(a=>a.text).sort(),['account.rotate','otherAllowed(path)']);
 assert.equal(raw.length,4);
});
test('R18 display retains ordinary atoms even when another atom implies them',async()=>{
 const {simplify}=await import('../react/audience.mjs');const source={file:'src/Test.tsx',line:1};const raw=[...atoms('account',source),...atoms('account.tier === "CURATOR"',source)];assert.equal(simplify(raw).length,2);
});
test('R18 disjunction display exposes the shared atom implied by the conjunction',async()=>{
 const {simplify}=await import('../react/audience.mjs');const source={file:'src/Test.tsx',line:1};const facts=[...atoms('accepted || office',source),...atoms('accepted || !office',source)];assert.deepEqual(simplify(facts).map(a=>[a.text,a.truth]),[['accepted',true]]);
});
test('R18 display never materializes an unsafe member hidden behind an optional short circuit',async()=>{
 const {simplify}=await import('../react/audience.mjs');const source={file:'src/Test.tsx',line:1};const facts=['!actor','!actor?.rotate','busy || !(actor?.tier === "CURATOR") || actor.office','!busy'].flatMap(x=>atoms(x,source));assert.equal(contradicts(facts),false);const shown=simplify(facts);assert.equal(contradicts(shown),false);assert.ok(!shown.some(a=>a.text==='false'));
});
test('R18 accepted guest summary drops optional properties and preserves optional syntax elsewhere',async()=>{
 const {simplify}=await import('../react/audience.mjs');const source={file:'src/Entry.tsx',line:3};
 const raw=['!pending','!visitor','!visitor?.renew','!(visitor?.grade === "OWNER")'].flatMap(x=>atoms(x,source));
 assert.deepEqual(simplify(raw).map(a=>[a.text,a.truth]),[['pending',false],['visitor',false]]);
 const uncertain=simplify(atoms('visitor?.renew',source));assert.equal(uncertain[0].text,'visitor?.renew');
 const branch=run(`function Gate({children}){if(pending)return null;if(visitor?.renew)return null;return children;}function Guest(){return <p>Guest</p>;}function Member(){return <p>Member</p>;}function Home(){if(!visitor)return <Guest/>;return <Member/>;}function App(){return <Gate><Routes><Route path="/" element={<Home/>}/></Routes></Gate>;}`);
 const guest=branch.screens.find(s=>s.audience.some(a=>a.text==='visitor'&&!a.truth));assert.ok(guest);assert.deepEqual(guest.audienceSummary.map(a=>[a.text,a.truth]),[['pending',false],['visitor',false]]);
 assert.ok(!JSON.stringify(guest.audienceSummary).includes('visitor.'));
});
test('R18 simplified optional display retains the prior canonical navigation projection key',()=>{
 const r=run(`import {createContext,useContext,useState} from "react";const Identity=createContext(null);function Provider({children}){const [visitor,store]=useState(null);return <Identity.Provider value={{visitor,store}}>{children}</Identity.Provider>;}function useIdentity(){return useContext(Identity);}function Gate({children}){const {visitor}=useIdentity();if(visitor?.renew)return null;return children;}function Guest(){return <p>Guest</p>;}function Member(){return <p>Member</p>;}function Home(){const {visitor}=useIdentity();if(!visitor)return <Guest/>;return <Member/>;}function Inner(){return <><a href="/">Home</a><Gate><Routes><Route path="/" element={<Home/>}/></Routes></Gate></>;}function App(){return <Provider><Inner/></Provider>;}`);
 const guest=r.screens.find(s=>s.audience.some(a=>a.text==='visitor'&&!a.truth));const target=guest.components.flatMap(c=>c.behaviors).flatMap(b=>b.targetConditions??[]).find(t=>t.variantKey===guest.variantKey);assert.ok(target);assert.equal(target.condition,'!(visitor)');assert.equal(target.conditionKey,'!(visitor) && !(visitor.renew)');
});
