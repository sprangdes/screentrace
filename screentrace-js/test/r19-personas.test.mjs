import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeReact} from '../react/analyzer.mjs';
const files=[{"file": "src/auth.tsx", "code": "import { createContext, useContext, useEffect, useState } from 'react';\n\nconst AuthContext = createContext(null);\n\nexport function AuthProvider({ children }) {\n  const [me, setMe] = useState(null);\n  const [loading, setLoading] = useState(true);\n  useEffect(() => {\n    fetch('/api/session').then(response => response.json()).then(user => setMe(user)).finally(() => setLoading(false));\n  }, []);\n  return <AuthContext.Provider value={{ me, loading }}>{children}</AuthContext.Provider>;\n}\n\nexport function useAuth() {\n  return useContext(AuthContext);\n}\n"}, {"file": "src/App.tsx", "code": "import { Routes, Route, Navigate, Link } from 'react-router-dom';\nimport { useAuth } from './auth';\n\nfunction RequireAuth({ children }) {\n  const { me, loading } = useAuth();\n  if (loading) return null;\n  if (!me) return <Navigate to=\"/login\" replace />;\n  return children;\n}\n\nfunction RequireCustomer({ children }) {\n  const { me } = useAuth();\n  if (me?.role !== 'ROLE_USER') return <Navigate to=\"/manage\" replace />;\n  return children;\n}\n\nfunction RequireBusiness({ children }) {\n  const { me } = useAuth();\n  if (me?.role !== 'ROLE_BUSINESS') return <Navigate to=\"/dashboard\" replace />;\n  return children;\n}\n\nfunction LoginPage() {\n  return <main><h1>Login</h1><Link to=\"/register\">Register</Link></main>;\n}\n\nfunction RegisterPage() {\n  return <main><h1>Register</h1><Link to=\"/login\">Back</Link></main>;\n}\n\nfunction DashboardPage() {\n  return <main><h1>Dashboard</h1><Link to=\"/reservations\">My reservations</Link><Link to=\"/manage\">Manage</Link></main>;\n}\n\nfunction ReservationsPage() {\n  return <main><h1>Reservations</h1><Link to=\"/dashboard\">Back</Link></main>;\n}\n\nfunction ManagePage() {\n  return <main><h1>Manage</h1><Link to=\"/dashboard\">Dashboard</Link></main>;\n}\n\nfunction Orphan() {\n  return <main><h1>Orphan</h1></main>;\n}\n\nexport default function App() {\n  return (\n    <Routes>\n      <Route path=\"/\" element={<RequireAuth><Navigate to=\"/dashboard\" replace /></RequireAuth>} />\n      <Route path=\"/login\" element={<LoginPage />} />\n      <Route path=\"/register\" element={<RegisterPage />} />\n      <Route path=\"/dashboard\" element={<RequireAuth><RequireCustomer><DashboardPage /></RequireCustomer></RequireAuth>} />\n      <Route path=\"/reservations\" element={<RequireAuth><RequireCustomer><ReservationsPage /></RequireCustomer></RequireAuth>} />\n      <Route path=\"/manage\" element={<RequireAuth><RequireBusiness><ManagePage /></RequireBusiness></RequireAuth>} />\n      <Route path=\"/orphan\" element={<RequireAuth><Orphan /></RequireAuth>} />\n    </Routes>\n  );\n}\n"}, {"file": "src/main.tsx", "code": "import { createRoot } from 'react-dom/client';\nimport { BrowserRouter } from 'react-router-dom';\nimport { AuthProvider } from './auth';\nimport App from './App';\n\ncreateRoot(document.getElementById('root')).render(<BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter>);\n"}];

const persona = facts => ({id:'customer',name:'顧客',startPaths:['/'],line:3,facts});
test('WP86 dimensions list identity leaves with literal values',()=>{
 const {personaDimensions:d}=analyzeReact({files,personas:[]});
 assert.ok(d.some(x=>x.text==='me'&&x.truthy)); assert.ok(d.some(x=>x.text==='loading'&&x.truthy));
 assert.deepEqual(d.find(x=>x.text==='me.role').values,['"ROLE_BUSINESS"','"ROLE_USER"']);
 assert.deepEqual(d.map(x=>x.text),d.map(x=>x.text).slice().sort());
});
test('WP86 personas absent adds no keys',()=>{const r=analyzeReact({files});assert.ok(!('personaDimensions' in r));assert.ok(!('personas' in r));});
test('WP86 contradictory persona is dropped with a diagnostic',()=>{const r=analyzeReact({files,personas:[persona([{text:'me',truth:false},{text:'me.role === "ROLE_USER"',truth:true}])]});assert.deepEqual(r.personas,[]);assert.ok(r.diagnostics.some(d=>d.code==='PERSONA_CONTRADICTORY'&&d.source.file==='workspace:config.json'));});
test('WP86 unmatched fact keeps the persona and reports it',()=>{const r=analyzeReact({files,personas:[persona([{text:'me',truth:true},{text:'me.tier === "GOLD"',truth:true}])]});assert.equal(r.personas.length,1);assert.ok(r.diagnostics.some(d=>d.code==='PERSONA_FACT_UNMATCHED'));});
const personas=[
 {id:'guest',name:'訪客',startPaths:['/'],line:3,facts:[{text:'loading',truth:false},{text:'me',truth:false}]},
 {id:'customer',name:'顧客',startPaths:['/'],line:3,facts:[{text:'loading',truth:false},{text:'me',truth:true},{text:'me.role === "ROLE_USER"',truth:true}]},
 {id:'merchant',name:'商家',startPaths:['/'],line:3,facts:[{text:'loading',truth:false},{text:'me',truth:true},{text:'me.role === "ROLE_BUSINESS"',truth:true}]}
];
test('WP87 screen verdicts follow route guards',()=>{
 const r=analyzeReact({files,personas});const expected={'/':['EXCLUDED','APPLIES','APPLIES'],'/login':['APPLIES','APPLIES','APPLIES'],'/register':['APPLIES','APPLIES','APPLIES'],'/dashboard':['EXCLUDED','APPLIES','EXCLUDED'],'/reservations':['EXCLUDED','APPLIES','EXCLUDED'],'/manage':['EXCLUDED','EXCLUDED','APPLIES'],'/orphan':['EXCLUDED','APPLIES','APPLIES']};
 for(const screen of r.screens)assert.deepEqual(personas.map(p=>screen.personas[p.id]),expected[screen.route],screen.route);
});
test('WP87 navigation verdicts use only persona facts and guards',()=>{
 const r=analyzeReact({files,personas});const screen=route=>r.screens.find(s=>s.route===route);const dest=e=>e.targetScreens?.map(s=>s.route)??e.targetRoutes??[];
 const redirect=(route,target)=>r.routeRedirects.find(x=>x.route===route&&dest(x.effect).includes(target))?.effect;
 const link=(route,label)=>screen(route).components.find(c=>c.label===label)?.behaviors.find(e=>e.type==='NAVIGATE');
 const rows=[[redirect('/','/login'),['APPLIES','EXCLUDED','EXCLUDED']],[redirect('/','/dashboard'),['APPLIES','APPLIES','APPLIES']],[redirect('/dashboard','/manage'),['APPLIES','EXCLUDED','APPLIES']],[redirect('/manage','/dashboard'),['APPLIES','APPLIES','EXCLUDED']],[redirect('/orphan','/login'),['APPLIES','EXCLUDED','EXCLUDED']],[screen('/').load.find(e=>e.type==='NAVIGATE'&&dest(e).includes('/login')),['APPLIES','EXCLUDED','EXCLUDED']],[link('/login','Register'),['APPLIES','APPLIES','APPLIES']],[link('/dashboard','Manage'),['APPLIES','APPLIES','APPLIES']]];
 for(const [effect,expected] of rows){assert.ok(effect);assert.deepEqual(personas.map(p=>effect.personas[p.id]),expected);}
 assert.ok(dest(link('/login','Register')).includes('/register'));assert.ok(dest(link('/dashboard','Manage')).includes('/dashboard'));
});
test('WP87 free page state stays unknown',()=>{
 const code=`import {Routes,Route} from 'react-router-dom';import {createRoot} from 'react-dom/client';
function Gate({children}){if(mode !== 'done')return null;return children;}function Callback(){return <main><h1>Done</h1></main>;}
export default function App(){return <Routes><Route path="/callback" element={<Gate><Callback/></Gate>}/></Routes>;}
createRoot(document.getElementById('root')).render(<App/>);`;
 const r=analyzeReact({files:[{file:'src/App.tsx',code}],personas:[{id:'customer',name:'顧客',startPaths:['/'],line:3,facts:[{text:'loading',truth:false}]}]});assert.equal(r.screens[0].personas.customer,'UNKNOWN');assert.ok(r.screens[0].audience.some(a=>a.text==='mode === "done"'));
});

const shellFixture="import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';\nimport { useAuth } from './auth';\n\nfunction SetupGuard({ children }) {\n  const { me } = useAuth();\n  const location = useLocation();\n  const allowPaths = ['/setup'];\n  if (me?.role === 'ROLE_BUSINESS' && !me.business && !allowPaths.includes(location.pathname)) return <Navigate to=\"/setup\" replace />;\n  return children;\n}\n\nfunction LoginPage() {\n  return <main><h1>Login</h1></main>;\n}\n\nfunction SetupPage() {\n  return <main><h1>Setup</h1><Link to=\"/login\">Login</Link></main>;\n}\n\nexport default function App() {\n  return (\n    <SetupGuard>\n      <Routes>\n        <Route path=\"/login\" element={<LoginPage />} />\n        <Route path=\"/setup\" element={<SetupPage />} />\n      </Routes>\n    </SetupGuard>\n  );\n}\n";

test('WP89 truncated dimensions keep identity leaves and facts match against all dimensions',()=>{
 const modified=files.map(f=>f.file==='src/App.tsx'?{...f,code:f.code.replace("import { useAuth } from './auth';","import { useAuth } from './auth';\nimport { Flags } from './flags';").replace('<h1>Login</h1>','<h1>Login</h1><Flags />')}:f);
 modified.push({file:'src/flags.tsx',code:'export function Flags() {\n  return <div>'+Array.from({length:70},(_,i)=>`{flag${String(i).padStart(2,'0')} && <button>f${i}</button>`).join('')+'</div>;\n}\n'});
 const r=analyzeReact({files:modified,personas:[personas[1]]});const names=r.personaDimensions.map(d=>d.text);
 assert.equal(names.length,64);for(const name of ['me','loading','me.role'])assert.ok(names.includes(name),name);assert.deepEqual(names,[...names].sort());assert.ok(r.diagnostics.some(d=>d.code==='PERSONA_DIMENSIONS_TRUNCATED'));assert.ok(!r.diagnostics.some(d=>d.code==='PERSONA_FACT_UNMATCHED'));
});
test('WP89 shell guard redirect becomes an entry redirect only where route facts allow it',()=>{
 const input=files.map(f=>f.file==='src/App.tsx'?{...f,code:shellFixture}:f);const setup={id:'merchant-setup',name:'未開店商家',startPaths:['/login'],line:3,facts:[{text:'me.role === "ROLE_BUSINESS"',truth:true},{text:'me.business',truth:false}]};
 const check=r=>{const redirects=r.routeRedirects.filter(x=>JSON.stringify(x.effect.targetRoutes)===JSON.stringify(['/setup']));assert.equal(redirects.length,1);assert.equal(redirects[0].route,'/login');return redirects[0];};
 const r=analyzeReact({files:input,personas:[setup]});assert.equal(check(r).effect.personas['merchant-setup'],'APPLIES');const screen=route=>r.screens.find(s=>s.route===route);assert.equal(screen('/setup').personas['merchant-setup'],'APPLIES');assert.equal(screen('/login').personas['merchant-setup'],'EXCLUDED');const load=screen('/setup').load.find(e=>e.type==='NAVIGATE'&&JSON.stringify(e.targetRoutes)===JSON.stringify(['/setup']));assert.equal(load.personas['merchant-setup'],'EXCLUDED');check(analyzeReact({files:input}));
});
