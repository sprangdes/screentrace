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
