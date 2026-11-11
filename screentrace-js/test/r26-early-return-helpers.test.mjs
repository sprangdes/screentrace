import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReact } from '../react/analyzer.mjs';

const auth = `import { createContext, useContext, useEffect, useState } from 'react';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch('/api/session').then(r => r.json()).then(user => setMe(user)).finally(() => setLoading(false)); }, []);
  return <AuthContext.Provider value={{ me, loading }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
`;
const app = (
  call,
  extra = '',
) => `import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from './auth';

function safeReturnTo(source) {
  if (typeof source !== 'string' || !source) return null;
  if (!source.startsWith('/') || source.startsWith('//')) return null;
  return source;
}
function destination(user, returnTo) {
  const safePath = safeReturnTo(returnTo);
  if (safePath && user.role === 'ROLE_USER') return { path: safePath };
  if (user.role === 'ROLE_BUSINESS') return { path: '/manage' };
  return { path: '/dashboard' };
}
function tone(action) {
  if (action === 'cancel') return 'destructive';
  return 'primary';
}
${extra}
function Home() {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!me) return <main><h1>Welcome</h1><button className={\`action action--\${tone('cancel')}\`}>Cancel</button></main>;
  return <Navigate to={${call}.path} replace />;
}
function Dashboard() { return <main><h1>Dashboard</h1></main>; }
function Manage() { return <main><h1>Manage</h1></main>; }
export default function App() {
  return <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/manage" element={<Manage />} />
  </Routes>;
}
createRoot(document.getElementById('root')).render(<AuthProvider><App /></AuthProvider>);
`;
const customer = {
  id: 'customer',
  name: '顧客',
  startPaths: ['/'],
  line: 3,
  facts: [
    { text: 'loading', truth: false },
    { text: 'me', truth: true },
    { text: 'me.role === "ROLE_USER"', truth: true },
  ],
};
const analyze = (call, extra) =>
  analyzeReact({
    files: [
      { file: 'src/auth.tsx', code: auth },
      { file: 'src/App.tsx', code: app(call, extra) },
    ],
    personas: [customer],
  });
const home = (r) => r.screens.find((s) => s.route === '/');
const navigations = (r) =>
  [...home(r).load, ...r.routeRedirects.filter((x) => x.route === '/').map((x) => x.effect)].filter(
    (e) => e.type === 'NAVIGATE',
  );
const to = (r, route) => navigations(r).filter((e) => (e.targetRoutes ?? []).includes(route));

test('R26 a helper called without an argument is followed through its early returns', () => {
  const r = analyze('destination(me)');
  const dashboard = to(r, '/dashboard');
  assert.ok(dashboard.length, 'the default destination is found');
  for (const effect of dashboard) {
    assert.ok(
      !/safePath/.test(effect.guard ?? ''),
      'the proven-null return path drops out of the guard',
    );
    assert.equal(effect.personas.customer, 'APPLIES');
  }
  assert.ok(
    !navigations(r).some(
      (e) => /safePath/.test(e.expression ?? '') || /safePath/.test(e.guard ?? ''),
    ),
    'no navigation keeps the impossible return-to branch',
  );
});

test('R26 an argument the analyzer cannot see keeps the helper unknown', () => {
  const r = analyze('destination(me, location.search)');
  const dashboard = to(r, '/dashboard');
  assert.ok(dashboard.length);
  assert.ok(
    dashboard.every((effect) => /safePath/.test(effect.guard ?? '')),
    'the return-to condition stays in the guard',
  );
  assert.ok(dashboard.every((effect) => effect.personas.customer === 'UNKNOWN'));
});

test('R26 early returns resolve values such as class names, and stop at statements they cannot follow', () => {
  const button = (r) =>
    home(r).components.find((c) => c.label === 'Cancel') ??
    home(r).excluded?.find((c) => c.label === 'Cancel');
  const r = analyze('destination(me)');
  assert.equal(button(r).attrs.className, 'action action--destructive');
  const blocked = analyzeReact({
    files: [
      { file: 'src/auth.tsx', code: auth },
      {
        file: 'src/App.tsx',
        code: app('destination(me)').replace(
          "if (action === 'cancel') return 'destructive';",
          "let picked = 'primary';\n  if (action === 'cancel') return 'destructive';",
        ),
      },
    ],
    personas: [customer],
  });
  assert.ok(button(blocked), 'the button is still found');
  assert.equal(
    button(blocked).attrs.className,
    undefined,
    'a let declaration stops the walk, so the class stays unknown',
  );
});
