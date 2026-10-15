import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeReact} from '../react/analyzer.mjs';

const ROUTER = "import { Routes, Route, Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';";
const run = files => analyzeReact({files: Object.entries(files).map(([file, code]) => ({file, code}))});
const screen = (result, route) => result.screens.find(item => item.route === route) ?? assert.fail(`no screen ${route}: ${result.screens.map(s => s.route)}`);
const effects = item => [...item.load, ...item.components.flatMap(component => component.behaviors)];
const component = (item, label) => item.components.find(c => c.label === label) ?? assert.fail(`no component ${label}: ${item.components.map(c => c.label)}`);

const API = `
export const API_BASE = '';
async function request(path, options = {}) {
  const response = await fetch(\`\${API_BASE}\${path}\`, { ...options, credentials: 'include' });
  return response.json();
}
export const api = {
  login: (payload) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request('/api/me'),
  cancel: (id) => request(\`/api/reservations/\${id}/cancel\`, { method: 'POST' }),
};`;

test('nested JSX routes join paths, render layouts through Outlet and name the page component', () => {
  const result = run({
    'src/App.tsx': `${ROUTER} import Shell from './Shell'; import Home from './Home'; import Detail from './Detail';
      export default function App(){ return <Routes><Route path="/admin" element={<Shell/>}><Route index element={<Home/>}/><Route path="items/:id" element={<Detail/>}/></Route></Routes>; }`,
    'src/Shell.tsx': `${ROUTER} export default function Shell(){ return <main><nav><Link to="/admin">Top</Link></nav><Outlet/></main>; }`,
    'src/Home.tsx': `export default function Home(){ return <button type="button">Refresh</button>; }`,
    'src/Detail.tsx': `export default function Detail(){ return <h1>Detail</h1>; }`
  });
  assert.deepEqual(result.screens.map(s => s.route), ['/admin', '/admin/items/:id']);
  const home = screen(result, '/admin');
  assert.equal(home.view, 'Home');
  assert.equal(home.viewSource, 'src/Home.tsx');
  assert.deepEqual(home.sources, ['src/App.tsx', 'src/Home.tsx', 'src/Shell.tsx']);
  assert.deepEqual(home.components.map(c => [c.kind, c.label]).sort(), [['BUTTON', 'Refresh'], ['LINK', 'Top']]);
  assert.ok(!screen(result, '/admin/items/:id').sources.includes('src/Home.tsx'));
});

test('router object arrays become screens', () => {
  const result = run({
    'src/main.tsx': `import { createBrowserRouter } from 'react-router-dom'; import Page from './Page';
      export const router = createBrowserRouter([{ path: '/', element: <Page/>, children: [{ path: 'about', element: <Page/> }] }]);`,
    'src/Page.tsx': `export default function Page(){ return <p>page</p>; }`
  });
  assert.deepEqual(result.screens.map(s => s.route), ['/about']);
});

test('a duplicated route keeps the first declaration and reports the second', () => {
  const result = run({
    'src/App.tsx': `${ROUTER} function A(){ return <p/>; } function B(){ return <a href="/x">x</a>; }
      export default function App(){ return <Routes><Route path="/a" element={<A/>}/><Route path="/a" element={<B/>}/></Routes>; }`
  });
  assert.equal(result.screens.length, 1);
  assert.equal(screen(result, '/a').view, 'A');
  assert.ok(result.diagnostics.some(item => item.code === 'REACT_DUPLICATE_ROUTE' && item.source.file === 'src/App.tsx'));
});

test('handlers follow an imported API object through its request wrapper to fetch', () => {
  const result = run({
    'src/api.ts': API,
    'src/App.tsx': `${ROUTER} import Login from './Login'; export default function App(){ return <Routes><Route path="/login" element={<Login/>}/><Route path="/home" element={<p/>}/></Routes>; }`,
    'src/Login.tsx': `import { useEffect } from 'react'; import { useNavigate } from 'react-router-dom'; import { api } from './api';
      export default function Login({ reservationId }){
        const navigate = useNavigate();
        useEffect(() => { void api.me(); }, []);
        const submit = async (event) => { event.preventDefault(); await api.login({}); navigate('/home'); };
        return <form onSubmit={submit}><input name="user" placeholder="帳號"/><input type="checkbox" name="remember"/><button>{busy ? '登入中' : '登入'}</button>
          <button type="button" onClick={() => api.cancel(reservationId)}>Cancel</button></form>;
      }`
  });
  const login = screen(result, '/login');
  assert.deepEqual(login.load.map(e => [e.type, e.method, e.urls]), [['CALL_API', 'GET', ['/api/me']]]);
  const submit = component(login, '登入中 / 登入');
  assert.equal(submit.kind, 'SUBMIT');
  assert.deepEqual(submit.behaviors.map(e => [e.type, e.method ?? null, e.urls, e.status]), [
    ['CALL_API', 'POST', ['/api/auth/login'], 'CONFIRMED'],
    ['NAVIGATE', null, ['/home'], 'CONFIRMED']
  ]);
  assert.deepEqual(submit.behaviors[0].trace.map(step => step.callee), ['api.login', 'request']);
  const cancel = component(login, 'Cancel');
  assert.deepEqual(cancel.behaviors.map(e => [e.method, e.urls, e.status]), [['POST', ['/api/reservations/{reservationId}/cancel'], 'INFERRED']]);
  assert.equal(component(login, '帳號').kind, 'TEXT_INPUT');
  assert.equal(component(login, 'remember').kind, 'CHECKBOX');
  assert.deepEqual(component(login, 'remember').behaviors, []);
});

test('literal props prune conditional rendering so each route keeps only its own content', () => {
  const result = run({
    'src/App.tsx': `${ROUTER} import Settings from './Settings';
      export default function App(){ return <Routes><Route path="/s/profile" element={<Settings page="profile"/>}/><Route path="/s/hours" element={<Settings page="hours"/>}/></Routes>; }`,
    'src/Settings.tsx': `const copy = { profile: { title: 'Profile' }, hours: { title: 'Hours' } };
      function Profile(){ return <button>Save profile</button>; }
      function Hours(){ return <button>Save hours</button>; }
      export default function Settings({ page }){
        const body = page === 'profile' ? <Profile/> : <Hours/>;
        switch (page) { case 'hours': return <section><h1>{copy[page].title}</h1>{body}</section>; default: return body; }
      }`
  });
  assert.deepEqual(screen(result, '/s/profile').components.map(c => c.label), ['Save profile']);
  assert.deepEqual(screen(result, '/s/hours').components.map(c => c.label), ['Save hours']);
});

test('links over a literal navigation array are unrolled and resolved to routes', () => {
  const result = run({
    'src/App.tsx': `${ROUTER} const items = [{ to: '/a', label: 'A' }, { to: '/b/7', label: 'B' }];
      function Menu(){ return <nav>{items.map(item => <NavLink key={item.to} to={item.to}>{item.label}</NavLink>)}</nav>; }
      export default function App(){ return <Routes><Route path="/a" element={<Menu/>}/><Route path="/b/:id" element={<p/>}/></Routes>; }`
  });
  const menu = screen(result, '/a');
  assert.deepEqual(menu.components.map(c => [c.label, c.behaviors[0].targetRoutes, c.behaviors[0].status]), [
    ['A', ['/a'], 'CONFIRMED'],
    ['B', ['/b/:id'], 'INFERRED']
  ]);
});

test('providers in the root render contribute page-load requests to every screen', () => {
  const result = run({
    'src/api.ts': API,
    'src/main.tsx': `import { createRoot } from 'react-dom/client'; import { BrowserRouter } from 'react-router-dom'; import App from './App'; import { AuthProvider } from './Auth';
      createRoot(document.getElementById('root')).render(<BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter>);`,
    'src/Auth.tsx': `import { createContext, useEffect } from 'react'; import { api } from './api'; const Ctx = createContext(null);
      function useSession(){ useEffect(() => { void api.me(); }, []); }
      export function AuthProvider({ children }){ useSession(); return <Ctx.Provider value={null}>{children}</Ctx.Provider>; }`,
    'src/App.tsx': `${ROUTER} export default function App(){ return <><header><a href="/help">Help</a></header><Routes><Route path="/one" element={<p/>}/><Route path="/two" element={<p/>}/></Routes></>; }`
  });
  for (const route of ['/one', '/two']) {
    const item = screen(result, route);
    assert.deepEqual(item.load.map(e => e.urls), [['/api/me']]);
    assert.deepEqual(item.components.map(c => c.label), ['Help']);
  }
  assert.deepEqual(result.diagnostics, []);
});

test('full-page loads of server URLs are requests; client routes stay navigation', () => {
  const result = run({
    'src/App.tsx': `${ROUTER} function Page(){ return <><button onClick={() => globalThis.location.assign('/api/auth/line/user')}>LINE</button><button onClick={() => { window.location.href = '/home'; }}>Home</button></>; }
      export default function App(){ return <Routes><Route path="/home" element={<Page/>}/><Route path="*" element={<p/>}/></Routes>; }`
  });
  const page = screen(result, '/home');
  assert.deepEqual(component(page, 'LINE').behaviors.map(e => [e.type, e.method, e.urls]), [['CALL_API', 'GET', ['/api/auth/line/user']]]);
  assert.deepEqual(component(page, 'Home').behaviors.map(e => [e.type, e.targetRoutes]), [['NAVIGATE', ['/home']]]);
});

test('unprovable requests and components stay unresolved with diagnostics', () => {
  const result = run({
    'src/App.tsx': `${ROUTER} import Missing from 'some-ui-kit/missing'; const Dynamic = registry[name];
      function Page({ url }){ return <><button onClick={() => fetch(url)}>Go</button><Dynamic/><Missing onClick={() => fetch('/api/x')}/></>; }
      export default function App(){ return <Routes><Route path="/p" element={<Page/>}/></Routes>; }`,
    'src/Broken.tsx': `export default function Broken( { return <div>; }`
  });
  const page = screen(result, '/p');
  assert.deepEqual(component(page, 'Go').behaviors.map(e => [e.type, e.urls, e.status]), [['CALL_API', [], 'UNRESOLVED']]);
  assert.ok(page.components.some(c => c.kind === 'OTHER' && c.behaviors.some(e => e.urls?.[0] === '/api/x')), 'library components keep their handlers');
  assert.ok(result.diagnostics.some(item => item.code === 'REACT_COMPONENT_UNRESOLVED' && item.message.includes('<Dynamic>')));
  assert.ok(result.diagnostics.some(item => item.code === 'REACT_SYNTAX_ERROR' && item.source.file === 'src/Broken.tsx'));
});

test('output is deterministic and independent of input order', () => {
  const files = {
    'src/api.ts': API,
    'src/App.tsx': `${ROUTER} import { api } from './api'; function P(){ return <button onClick={() => api.login({})}>Go</button>; }
      export default function App(){ return <Routes><Route path="/p" element={<P/>}/><Route path="/q" element={<P/>}/></Routes>; }`
  };
  const first = JSON.stringify(run(files));
  const reversed = JSON.stringify(analyzeReact({files: Object.entries(files).reverse().map(([file, code]) => ({file, code}))}));
  assert.equal(first, reversed);
  assert.equal(first, JSON.stringify(run(files)));
});

test('filtered literal arrays keep only items the predicate cannot rule out', () => {
  const result = run({
    'src/App.tsx': `${ROUTER} const items = [{ label: 'A', to: '/a' }, { label: 'Hidden' }, { label: 'B', to: '/b' }];
      function Nav(){ const visible = items.filter(item => item.to); return <nav>{visible.map(item => <Link key={item.label} to={item.to}>{item.label}</Link>)}</nav>; }
      export default function App(){ return <Routes><Route path="/a" element={<Nav/>}/><Route path="/b" element={<p/>}/></Routes>; }`
  });
  assert.deepEqual(screen(result, '/a').components.map(c => [c.label, c.target]), [['A', '/a'], ['B', '/b']]);
});

test('preview markup escapes text, drops handlers and prefers the resting branch', () => {
  const result = analyzeReact({markup: true, files: [{file: 'src/App.tsx', code: `${ROUTER} import { useThing } from 'some-store';
function Page(){
  const { busy, result } = useThing();
  if (result) return <p>Done</p>;
  return <main className={\`page\${busy ? ' is-busy' : ''}\`} style={{ minWidth: 44, color: 'red' }}>
    <button onClick={() => alert(1)} dangerouslySetInnerHTML={{ __html: '<b>x</b>' }}>{busy ? 'Saving' : 'Save <now>'}</button>
    {busy && <div className="modal show" role="dialog">Wait</div>}
    <script>evil()</script>
  </main>;
}
export default function App(){ return <Routes><Route path="/p" element={<Page/>}/></Routes>; }`}]});
  const page = screen(result, '/p');
  assert.match(page.markup, /^<main class="page" data-st-source-file="src\/App.tsx" data-st-source-line="5" style="min-width:44px;color:red">/);
  assert.match(page.markup, /<button data-st-expansion-anchor="[^"]+" [^>]*>Save &lt;now&gt;<\/button>/);
  assert.match(page.markup, /data-st-condition="[^"]*busy[^"]*" [^>]*role="dialog" style="display:none!important">Wait<\/div>/);
  assert.doesNotMatch(page.markup, /onclick|alert|<script|evil|<b>|Done|Saving/i);
  assert.deepEqual(page.components.map(c => c.kind).sort(), ['BUTTON', 'MODAL']);
});

test('a conditional dialog is closed together with its fixed layer and backdrop', () => {
  const result = analyzeReact({markup: true, files: [{file: 'src/App.tsx', code: `${ROUTER} import { useThing } from 'some-store';
function Overlay(){ return <div className="layer" role="presentation"><button className="layer__backdrop" aria-label="close"/><section aria-modal="true" className="sheet"><button>Confirm</button></section></div>; }
function Page(){ const { target } = useThing(); return <main><h1>List</h1>{target && <Overlay/>}{target && <div className="scrim"/>}</main>; }
export default function App(){ return <Routes><Route path="/p" element={<Page/>}/></Routes>; }`}]});
  const page = screen(result, '/p');
  assert.match(page.markup, /<div class="layer" data-st-condition="[^"]*target[^"]*" [^>]*role="presentation" style="display:none!important">/);
  assert.match(page.markup, /<div class="scrim" [^>]*style="display:none!important">/);
  assert.match(page.markup, /<main [^>]*><h1 [^>]*>List<\/h1>/);
  assert.doesNotMatch(page.markup, /<main[^>]*display:none/);
  assert.ok(page.components.some(c => c.label === 'Confirm'), 'the dialog buttons stay listed');
});

test('click behaviors carry only the handler conditions, not the conditions that show the element', () => {
  const result = run({
    'src/App.tsx': `${ROUTER} import { useThing } from 'some-store';
      function Page(){ const { open, busy } = useThing(); return <>{open && <button onClick={() => { if (busy) return; fetch('/api/x', { method: 'POST' }); }}>Go</button>}</>; }
      export default function App(){ return <Routes><Route path="/p" element={<Page/>}/></Routes>; }`
  });
  const go = component(screen(result, '/p'), 'Go');
  assert.equal(go.guard, 'open');
  assert.deepEqual(go.behaviors.map(e => [e.urls, e.guard]), [[['/api/x'], '!(busy)']]);
});

test('a route that only redirects is marked as such and never named after a shell provider', () => {
  const result = run({
    'src/main.tsx': `import { createRoot } from 'react-dom/client'; import App from './App';
      function AuthProvider({ children }){ return <>{children}</>; }
      createRoot(document.body).render(<AuthProvider><App/></AuthProvider>);`,
    'src/App.tsx': `${ROUTER} import { useThing } from 'some-store';
      function Home(){ return <h1>Home</h1>; }
      function Guard({ children }){ const { me } = useThing(); if (!me) return <Navigate to="/"/>; return children; }
      function Old(){ return <Guard><Navigate to="/home" replace/></Guard>; }
      export default function App(){ return <Routes><Route path="/" element={<p>Start</p>}/><Route path="/home" element={<Home/>}/><Route path="/old" element={<Old/>}/><Route path="*" element={<Navigate to="/"/>}/></Routes>; }`
  });
  assert.deepEqual([screen(result, '/old').redirectOnly, screen(result, '/old').redirectTo], [true, ['/home', '/']]);
  assert.deepEqual([screen(result, '/*').redirectOnly, screen(result, '/*').redirectTo, screen(result, '/*').view], [true, ['/'], 'Route']);
  assert.equal(screen(result, '/home').redirectOnly, false);
  assert.equal(screen(result, '/').view, 'Route');
});
