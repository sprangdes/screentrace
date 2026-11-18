// R98 (ADR 0173): renamed props, Context values and hooks that return a condition.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReact } from '../react/analyzer.mjs';

const R = "import { Routes, Route, Link } from 'react-router-dom';";
const files = {
  'src/App.tsx': `${R} import { useAuth } from './auth'; import PublicHome from './PublicHome';
    function Home(){ const { me, loading } = useAuth(); if (loading) return null; if (!me) return <PublicHome/>; return <Workspace/>; }
    function Workspace(){ return <main><h1>工作區</h1></main>; }
    export default function App(){ return <Routes><Route path="/" element={<Home/>}/></Routes>; }`,
  'src/auth.tsx': `import { createContext, useContext, useEffect, useState } from 'react';
    const AuthContext = createContext(null);
    export function AuthProvider({ children }) { const [me, setMe] = useState(null); const [loading, setLoading] = useState(true);
      useEffect(() => { fetch('/api/me').then(r => r.json()).then(u => setMe(u)).finally(() => setLoading(false)); }, []);
      return <AuthContext.Provider value={{ me, loading, isCustomer: me?.role === 'ROLE_USER' }}>{children}</AuthContext.Provider>; }
    export function useAuth() { return useContext(AuthContext); }
    export function useIsAdmin() { const { me } = useAuth(); return me?.role === 'ADMIN'; }`,
  'src/main.tsx': `import { createRoot } from 'react-dom/client'; import { BrowserRouter } from 'react-router-dom'; import { AuthProvider } from './auth'; import App from './App';
    createRoot(document.getElementById('root')).render(<BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter>);`,
  'src/PublicHome.tsx': `${R} import { useAuth, useIsAdmin } from './auth';
    function Header({ isCustomer: customer }){ return <nav>{customer ? <button>登出</button> : <a href="/login">登入</a>}</nav>; }
    export default function PublicHome(){ const { isCustomer } = useAuth(); const admin = useIsAdmin();
      return <main><Header isCustomer={isCustomer}/>{admin ? <p>管理</p> : null}</main>; }`,
};

test('R98 the signed-out screen decides renamed props, Context values and hook conditions', () => {
  const r = analyzeReact({
    files: Object.entries(files).map(([file, code]) => ({ file, code })),
    markup: true,
  });
  const guest = r.screens.find((s) => (s.audience ?? []).some((a) => a.text === 'me' && !a.truth));
  assert.equal(
    guest.markup.replace(/ data-st-[a-z-]+="[^"]*"/g, ''),
    '<main><nav><a href="/login">登入</a></nav></main>',
  );
});
