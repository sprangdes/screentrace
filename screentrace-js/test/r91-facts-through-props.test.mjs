// R91 (ADR 0168): a screen's own facts decide conditions passed down as props and constants.
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
      return <AuthContext.Provider value={{ me, loading }}>{children}</AuthContext.Provider>; }
    export function useAuth() { return useContext(AuthContext); }`,
  'src/main.tsx': `import { createRoot } from 'react-dom/client'; import { BrowserRouter } from 'react-router-dom'; import { AuthProvider } from './auth'; import App from './App';
    createRoot(document.getElementById('root')).render(<BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter>);`,
  'src/nav.ts': `export function items(isCustomer){ return isCustomer ? [{ label: '概覽', to: '/d' }, { label: '我的預約', to: '/m' }] : [{ label: '我要預約', to: '/r' }, { label: '登入', to: '/login' }]; }`,
  'src/PublicHome.tsx': `${R} import { useAuth } from './auth'; import { items } from './nav';
    function Header({ isCustomer }){ const list = items(isCustomer); return <nav>{list.map(i => <Link key={i.to} to={i.to}>{i.label}</Link>)}{isCustomer ? <button>登出</button> : null}</nav>; }
    function Hero({ isCustomer }){ const p = isCustomer ? { label: '前往預約' } : { label: '開始預約' }; return <a href="/x">{p.label}</a>; }
    export default function PublicHome(){ const { me } = useAuth(); const isCustomer = me?.role === 'ROLE_USER'; return <main><Header isCustomer={isCustomer}/><Hero isCustomer={isCustomer}/></main>; }`,
};

test('R91 the signed-out variant shows the signed-out menu, buttons and no logout', () => {
  const r = analyzeReact({
    files: Object.entries(files).map(([file, code]) => ({ file, code })),
    markup: true,
  });
  const guest = r.screens.find((s) => (s.audience ?? []).some((a) => a.text === 'me' && !a.truth));
  assert.equal(
    guest.markup.replace(/ data-st-[a-z-]+="[^"]*"/g, ''),
    '<main><nav><a href="/r">我要預約</a><a href="/login">登入</a></nav><a href="/x">開始預約</a></main>',
  );
  const signedIn = r.screens.find((s) =>
    (s.audience ?? []).some((a) => a.text === 'me' && a.truth),
  );
  assert.match(signedIn.markup, /工作區/);
});
