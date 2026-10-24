import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeReact} from '../react/analyzer.mjs';
const source=`import {Routes,Route,Navigate,Link} from 'react-router-dom';import {useEffect} from 'react';import {createRoot} from 'react-dom/client';
 function Visitor(){return <a href="/enter">Enter</a>;}
 function Editor(){return <button>Edit</button>;}
 function Choose(){if(!account)return <Visitor/>;if(account?.tier==='EDITOR')return <Editor/>;return <Navigate to="/reader"/>;}
 function Readers({children}){if(!account)return null;if(account.tier!=='READER')return <Navigate to="/"/>;return children;}
 function Editors({children}){if(!account)return null;if(account.tier!=='EDITOR')return null;return children;}
 function Panel(){useEffect(()=>{fetch('/api/reader-panel')},[]);return <a href="/reader">Panel</a>;}
 function Header(){return <nav>{account ? account.tier==='EDITOR'?<a href="/editor">Editor</a>:<Panel/>:<a href="/enter">Enter</a>}</nav>;}
 function Local(){return <section>{featureFlag && <button>Optional</button>}<button>Always</button></section>;}
 function App(){return <><Header/><Routes><Route path="/" element={<Choose/>}/><Route path="/reader" element={<Readers><Local/></Readers>}/><Route path="/editor" element={<Editors><Local/></Editors>}/></Routes></>;}
 createRoot(document.getElementById('root')).render(<App/>);`;
const run = code => analyzeReact({files:[{file:'src/App.tsx',code}],markup:true});

test('WP79 route dispatch becomes two audience variants and retains redirect branch separately',()=>{
 const result=run(source),home=result.screens.filter(s=>s.route==='/');
 assert.equal(home.length,2);assert.equal(new Set(home.map(s=>s.variantKey)).size,2);
 assert.ok(home.some(s=>s.markup.includes('Enter')&&!s.markup.includes('Edit')));
 assert.ok(home.some(s=>s.markup.includes('Edit')&&!s.components.some(c=>c.target==='/enter')));
 assert.ok(result.routeRedirects.some(r=>r.route==='/'&&r.effect.urls.includes('/reader')));
 assert.deepEqual(run(source).screens.map(s=>s.variantKey),result.screens.map(s=>s.variantKey));
});

test('WP79 shell links and branch-only panel API follow audience, unknown local conditions keep one screen',()=>{
 const result=run(source),reader=result.screens.find(s=>s.route==='/reader'),editor=result.screens.find(s=>s.route==='/editor');
 assert.equal(result.screens.filter(s=>s.route==='/reader').length,1);
 assert.equal(reader.variantKey,undefined);
 assert.ok(!reader.components.some(c=>c.target==='/editor'));
 assert.ok(!reader.markup.includes('>Editor<'));assert.ok(reader.markup.includes('Optional'));
 assert.ok(editor.load.every(b=>!b.urls?.includes('/api/reader-panel')));
 assert.ok(reader.load.some(b=>b.urls?.includes('/api/reader-panel')));
 assert.ok(editor.excluded.some(c=>c.guard && c.source.line>0));
});
