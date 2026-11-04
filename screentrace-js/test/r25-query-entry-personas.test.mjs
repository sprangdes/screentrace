import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeReact} from '../react/analyzer.mjs';

const auth=`import { createContext, useContext, useEffect, useState } from 'react';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch('/api/session').then(r => r.json()).then(user => setMe(user)).finally(() => setLoading(false)); }, []);
  return <AuthContext.Provider value={{ me, loading }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
`;
const app=links=>`import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from './auth';

function AuthRouteRedirect({ children }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  const lineLogin = new URLSearchParams(location.search).get('lineLogin');
  if (lineLogin === 'success' || lineLogin === 'failed') return children;
  if (loading || !me) return children;
  return <Navigate to="/dashboard" replace />;
}
function Home() { return <main><h1>Home</h1>${links}</main>; }
function Login() { return <main><h1>Login</h1></main>; }
function Dashboard() { return <main><h1>Dashboard</h1></main>; }
export default function App() {
  return <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={<AuthRouteRedirect><Login /></AuthRouteRedirect>} />
    <Route path="/dashboard" element={<Dashboard />} />
  </Routes>;
}
createRoot(document.getElementById('root')).render(<AuthProvider><App /></AuthProvider>);
`;
const guest={id:'guest',name:'訪客',startPaths:['/'],line:3,facts:[{text:'loading',truth:false},{text:'me',truth:false}]};
const analyze=links=>analyzeReact({files:[{file:'src/auth.tsx',code:auth},{file:'src/App.tsx',code:app(links)}],personas:[guest]});
const logins=r=>r.screens.filter(s=>s.route==='/login');
const plain=r=>logins(r).find(s=>s.queryEntryPlain),query=r=>logins(r).find(s=>s.entryQuery);
const link=(r,label)=>r.screens.find(s=>s.route==='/').components.find(c=>c.label===label).behaviors.find(e=>e.type==='NAVIGATE');

test('R25 the plain version of a route split by a URL parameter leaves the parameter to the link',()=>{
 const r=analyze('<Link to="/login">Sign in</Link>');
 assert.equal(logins(r).length,2);
 assert.ok(plain(r).audience.some(a=>a.text==='lineLogin === "success"'&&a.truth===false),'the screen still records the parameter conditions');
 assert.equal(plain(r).personas.guest,'APPLIES');
 assert.equal(query(r).personas.guest,'UNKNOWN','the parameter version still needs a link that carries the parameter');
 assert.ok(!logins(r).some(s=>'queryDefaults' in s),'the working field is not emitted');
});

test('R25 a link whose URL chooses the version keeps its verdict',()=>{
 const r=analyze('<Link to="/login">Sign in</Link><Link to="/login?lineLogin=success">Back from LINE</Link>');
 const signIn=link(r,'Sign in'),back=link(r,'Back from LINE');
 assert.deepEqual(signIn.targetScreens.map(t=>t.entryQuery??'plain'),['plain']);
 assert.equal(signIn.personas.guest,'APPLIES');
 assert.deepEqual(back.targetScreens.map(t=>t.entryQuery??'plain'),['lineLogin=failed|success']);
 assert.equal(back.personas.guest,'APPLIES');
});

test('R25 a link whose URL does not choose the version cannot make either one certain',()=>{
 const r=analyze('<Link to={`/login?${search}`}>Sign in</Link>');
 const signIn=link(r,'Sign in');
 assert.deepEqual(signIn.targetScreens.map(t=>t.entryQuery??'plain').sort(),['lineLogin=failed|success','plain']);
 assert.equal(signIn.personas.guest,'UNKNOWN');
});
