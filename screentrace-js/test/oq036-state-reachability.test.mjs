import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeReact} from '../react/analyzer.mjs';

// OQ-036: a component state's possible values come from its initial value and the writes reachable for the screen's audience.
const ROUTER = "import { Routes, Route, Navigate } from 'react-router-dom'; import { useState, useEffect } from 'react';";
const GATES = `
function StaffGate({children}){ if (user?.kind !== 'staff') return <Navigate to="/"/>; return children; }
function MemberGate({children}){ if (user?.kind !== 'member') return <Navigate to="/"/>; return children; }
function Shell({children}){ return <div><TopNav/><main>{children}</main></div>; }
function StaffPage(){ return <section><h1>Staff</h1></section>; }
function MemberPage(){ return <section><h1>Member</h1></section>; }
function OpenPage(){ return <section><h1>Open</h1></section>; }
function FavPanel({onDone}){ useEffect(() => { fetch('/api/favorites'); }, []); return <button type="button" onClick={() => { fetch('/api/favorites', {method: 'POST'}); onDone(); }}>Save favorites</button>; }
function App(){ return <Routes>
  <Route path="/staff" element={<StaffGate><Shell><StaffPage/></Shell></StaffGate>}/>
  <Route path="/member" element={<MemberGate><Shell><MemberPage/></Shell></MemberGate>}/>
  <Route path="/open" element={<Shell><OpenPage/></Shell>}/>
</Routes>; }`;

function run(topNav) {
  return analyzeReact({files: [{file: 'src/App.tsx', code: `${ROUTER} ${GATES} ${topNav}`}]}, {markup: true});
}
const screen = (result, route) => result.screens.find(s => s.route === route) ?? assert.fail(`no screen ${route}: ${result.screens.map(s => s.route)}`);
const apis = s => [...s.load, ...s.components.flatMap(c => c.behaviors)].filter(e => e.type === 'CALL_API').flatMap(e => (e.urls ?? []).map(u => `${e.method ?? 'GET'} ${u}`)).sort();
const hasFavorites = s => apis(s).some(a => a.endsWith('/api/favorites'));

const PANEL = `{panel ? <div className="modal"><h5>Favorite stores</h5><FavPanel onDone={close}/></div> : null}`;

test('OQ-036 a panel opened only from the member branch is unreachable on staff screens', () => {
  const result = run(`function TopNav(){ const [panel, setPanel] = useState(null); const close = () => setPanel(null); const open = (p) => { setPanel(p); };
    return <><nav>{user?.kind === 'staff' ? <a href="/desk">Desk</a> : <button type="button" onClick={() => open('favorites')}>Favorites</button>}</nav>${PANEL}</>; }`);
  assert.ok(!hasFavorites(screen(result, '/staff')), JSON.stringify(apis(screen(result, '/staff'))));
  assert.ok(!(screen(result, '/staff').markup ?? '').includes('Favorite stores'));
  assert.ok(hasFavorites(screen(result, '/member')), JSON.stringify(apis(screen(result, '/member'))));
  assert.ok(hasFavorites(screen(result, '/open')), JSON.stringify(apis(screen(result, '/open'))));
});

test('OQ-036 a setter passed to another component keeps the panel possible', () => {
  const result = run(`function Picker({onPick}){ return <button type="button" onClick={() => onPick('favorites')}>Pick</button>; }
    function TopNav(){ const [panel, setPanel] = useState(null); const close = () => setPanel(null);
    return <><nav>{user?.kind === 'staff' ? <Picker onPick={setPanel}/> : null}</nav>${PANEL}</>; }`);
  assert.ok(hasFavorites(screen(result, '/staff')), JSON.stringify(apis(screen(result, '/staff'))));
});

test('OQ-036 an opener reachable on the screen and called with a non-literal value keeps the panel possible', () => {
  const result = run(`function TopNav(){ const choice = window.localStorage.getItem('panel'); const [panel, setPanel] = useState(null); const close = () => setPanel(null); const open = (p) => { setPanel(p); };
    return <><nav>{user?.kind === 'staff' ? <a href="/desk">Desk</a> : null}<button type="button" onClick={() => open(choice)}>Favorites</button></nav>${PANEL}</>; }`);
  assert.ok(hasFavorites(screen(result, '/staff')), JSON.stringify(apis(screen(result, '/staff'))));
});

test('OQ-036 a write in an effect counts on every screen', () => {
  const result = run(`function TopNav(){ const [panel, setPanel] = useState(null); const close = () => setPanel(null);
    useEffect(() => { if (window.location.hash === '#fav') setPanel('favorites'); }, []);
    return <><nav><a href="/desk">Desk</a></nav>${PANEL}</>; }`);
  assert.ok(hasFavorites(screen(result, '/staff')), JSON.stringify(apis(screen(result, '/staff'))));
});
