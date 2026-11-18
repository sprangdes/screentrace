// R89 (ADR 0167): personas suggested from route guards when none are configured.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReact } from '../react/analyzer.mjs';

const files = [
  {
    file: 'src/App.tsx',
    code: `import { Routes, Route, Navigate } from 'react-router-dom'; import { useAuth } from './auth';
      function Shop(){ const { me, loading } = useAuth(); if (loading) return null;
        if (!me) return <Navigate to="/login"/>; if (me.role !== 'ROLE_SELLER') return <Navigate to="/"/>; return <h1>店家</h1>; }
      function Buy(){ const { me, loading } = useAuth(); if (loading) return null;
        if (!me) return <Navigate to="/login"/>; if (me.role !== 'ROLE_BUYER') return <Navigate to="/"/>; return <h1>購物</h1>; }
      function Login(){ return <h1>登入</h1>; }
      function Home(){ return <h1>首頁</h1>; }
      export default function App(){ return <Routes>
        <Route path="/" element={<Home/>}/><Route path="/login" element={<Login/>}/>
        <Route path="/shop" element={<Shop/>}/><Route path="/buy" element={<Buy/>}/></Routes>; }`,
  },
  { file: 'src/auth.ts', code: 'export function useAuth(){ return useContext(Ctx); }' },
];

test('R89 a guest and one persona per role value are suggested, each saying so', () => {
  const r = analyzeReact({ files, suggestPersonas: true });
  assert.deepEqual(
    r.personas.map((p) => [p.id, p.name]),
    [
      ['guest', '未登入'],
      ['role-role-buyer', 'BUYER'],
      ['role-role-seller', 'SELLER'],
    ],
  );
  assert.ok(r.personas.every((p) => p.description.startsWith('自動建議') && p.suggested));
  // Loading is false for everyone; a role persona is signed in and has its role.
  const seller = r.personas.find((p) => p.id === 'role-role-seller');
  assert.deepEqual(seller.facts.map((f) => [f.text, f.truth]).sort(), [
    ['loading', false],
    ['me', true],
    ['me.role === "ROLE_SELLER"', true],
  ]);
  // Without the request flag nothing is added (WP86).
  assert.ok(!('personas' in analyzeReact({ files })));
});

test('R92 a role persona takes the value of other flags most of its guarded screens require', () => {
  const guarded = [
    {
      file: 'src/App.tsx',
      code: `import { Routes, Route, Navigate } from 'react-router-dom'; import { useAuth } from './auth';
        function RequireSeller({ children }){ const { me, loading } = useAuth(); if (loading) return null;
          if (!me) return <Navigate to="/login"/>; if (me.role !== 'ROLE_SELLER') return <Navigate to="/"/>;
          if (!me.shop) return <Navigate to="/setup"/>; return children; }
        function RequireSetup({ children }){ const { me } = useAuth(); if (!me || me.role !== 'ROLE_SELLER' || me.shop) return <Navigate to="/"/>; return children; }
        function RequireBuyer({ children }){ const { me } = useAuth(); if (!me || me.role !== 'ROLE_BUYER') return <Navigate to="/"/>; return children; }
        const Page = ({ t }) => <main><h1>{t}</h1></main>;
        export default function App(){ return <Routes>
          <Route path="/" element={<Page t="首頁"/>}/>
          <Route path="/orders" element={<RequireSeller><Page t="訂單"/></RequireSeller>}/>
          <Route path="/items" element={<RequireSeller><Page t="商品"/></RequireSeller>}/>
          <Route path="/setup" element={<RequireSetup><Page t="開店"/></RequireSetup>}/>
          <Route path="/buy" element={<RequireBuyer><Page t="購物"/></RequireBuyer>}/></Routes>; }`,
    },
    {
      file: 'src/auth.tsx',
      code: `import { createContext, useContext, useEffect, useState } from 'react';
        const AuthContext = createContext(null);
        export function AuthProvider({ children }) { const [me, setMe] = useState(null); const [loading, setLoading] = useState(true);
          useEffect(() => { fetch('/api/me').then(r => r.json()).then(u => setMe(u)).finally(() => setLoading(false)); }, []);
          return <AuthContext.Provider value={{ me, loading }}>{children}</AuthContext.Provider>; }
        export function useAuth() { return useContext(AuthContext); }`,
    },
    {
      file: 'src/main.tsx',
      code: `import { createRoot } from 'react-dom/client'; import { BrowserRouter } from 'react-router-dom'; import { AuthProvider } from './auth'; import App from './App';
        createRoot(document.getElementById('root')).render(<BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter>);`,
    },
  ];
  const r = analyzeReact({ files: guarded, suggestPersonas: true });
  const facts = (id) =>
    r.personas
      .find((p) => p.id === id)
      .facts.filter((f) => f.text !== 'loading')
      .map((f) => [f.text, f.truth])
      .sort();
  // Two of the three seller screens require a shop: an ordinary seller has one.
  assert.deepEqual(facts('role-role-seller'), [
    ['me', true],
    ['me.role === "ROLE_SELLER"', true],
    ['me.shop', true],
  ]);
  assert.deepEqual(facts('role-role-buyer'), [
    ['me', true],
    ['me.role === "ROLE_BUYER"', true],
  ]);
  const orders = r.screens.find((s) => s.route === '/orders');
  assert.equal(orders.personas['role-role-seller'], 'APPLIES');
});

test('R102 a suggested role takes the word the frontend uses for its value', () => {
  const labelled = [
    ...files,
    {
      file: 'src/roles.ts',
      code: "export const ROLE_NAMES = { ROLE_SELLER: '店家', ROLE_BUYER: '買家' };",
    },
  ];
  const r = analyzeReact({ files: labelled, suggestPersonas: true });
  assert.deepEqual(
    r.personas.map((p) => p.name),
    ['未登入', '買家', '店家'],
  );
});
