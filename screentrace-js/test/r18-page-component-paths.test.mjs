import test from 'node:test';import assert from 'node:assert/strict';import {analyzeReact} from '../react/analyzer.mjs';
const router="import {Routes,Route,Outlet,Navigate} from 'react-router-dom';";
const run=(code,markup=false)=>analyzeReact({files:[{file:'src/App.tsx',code}],markup});
const eBase=`${router}function SideMenu(){return <nav/>}function TopStrip(){return <header/>}function Frame({children}){return <div><SideMenu/><TopStrip/><main>{children}</main></div>}function Watcher(){return <aside/>}function Provider({children}){return <section><Watcher/>{children}</section>}function Infra({children}){return <Provider><Watcher/>{children}</Provider>}function AuthGate({children}){if(!user)return <Navigate to="/login"/>;return children}function RoleGate({children}){if(user?.kind!=='staff')return <Navigate to="/"/>;return children}`;
test('WP83 e follows auth guard and picker branch to each page',()=>{
 const r=run(`${eBase}function StaffInbox(){return <main>Staff</main>}function Inbox(){return <main>Inbox</main>}function Picker(){if(user?.kind==='staff')return <Frame><StaffInbox/></Frame>;return <Inbox/>}function App(){return <Routes><Route path="/pick" element={<AuthGate><Picker/></AuthGate>}/></Routes>}`);
 const pages=r.screens.filter(s=>s.route==='/pick');assert.ok(pages.some(s=>s.view==='StaffInbox'));assert.ok(pages.some(s=>s.view==='Inbox'));
});
test('WP83 f follows nested guards and route component output shells',()=>{
 const r=run(`${eBase}function BoardPage({mode}){return <main>{mode}</main>}function BoardRoute({mode}){return <Frame><BoardPage mode={mode}/></Frame>}function App(){return <Routes><Route path="/board" element={<AuthGate><RoleGate><BoardRoute mode="a"/></RoleGate></AuthGate>}/></Routes>}`);
 assert.equal(r.screens.find(s=>s.route==='/board')?.view,'BoardPage');
});
test('WP83 g follows pure composition, infrastructure shell and selects the last return',()=>{
 const r=run(`${eBase}function Skeleton(){return <div/>}function Footer(){return <footer/>}function PrefsFrame({children}){return <main><TopStrip/><h1>偏好</h1>{children}</main>}function PrefsContent({busy}){if(busy)return <PrefsFrame><Skeleton/></PrefsFrame>;return <PrefsFrame><section><h2>A</h2></section><Footer/></PrefsFrame>}function PrefsPage(){return <Infra><PrefsContent/></Infra>}function PrefsRoute(){return <PrefsPage/>}function App(){return <Routes><Route path="/prefs" element={<AuthGate><PrefsRoute/></AuthGate>}/></Routes>}`);
 assert.equal(r.screens.find(s=>s.route==='/prefs')?.view,'PrefsContent');
});
test('WP83 h custom hook successful load state suppresses its error banner',()=>{
 const r=run(`${router}import {useState,useEffect} from 'react';async function apiBoard(){return {ok:true}}function useBoardData(){const [state,setState]=useState({phase:'idle'});async function load(){try{await apiBoard();setState({phase:'ready'})}catch{setState({phase:'error'})}}useEffect(()=>{load()},[]);return {state}}function Overview(){const overview=useBoardData();return <>{overview.state.phase==='error'?<div className="err">無法載入</div>:null}<p>內容</p></>}function App(){return <Routes><Route path="/overview" element={<Overview/>}/></Routes>}`,true);
 const markup=r.screens.find(s=>s.route==='/overview')?.markup??'';assert.doesNotMatch(markup,/無法載入/);assert.match(markup,/內容/);
});
test('WP83 i uses each chooser branch when variant splitting occurs behind a wrapper',()=>{
 const r=analyzeReact({files:[{file:'src/mode.ts',code:"export function pick(kind, desk){ return kind === 'staff' && desk ? 'staff-mode' : 'plain'; }"},{file:'src/App.tsx',code:`${router}import { pick } from './mode';function SideMenu(){return <nav/>}function TopStrip(){return <header/>}function Frame({children}){return <div><SideMenu/><TopStrip/><main>{children}</main></div>}function AuthGate({children}){if (!user) return <Navigate to="/login"/>; return children}function StaffPrefs(){return <section>Staff</section>}function Prefs(){return <section>Prefs</section>}function Chooser(){if (pick(user?.kind, Boolean(user?.desk)) === 'staff-mode') return <Frame><StaffPrefs/></Frame>; return <Prefs/>}function Compat(){return <Chooser/>}function App(){return <Routes><Route path="/compat" element={<AuthGate><Compat/></AuthGate>}/></Routes>}`} ]});
 const pages=r.screens.filter(s=>s.route==='/compat');assert.ok(pages.some(s=>s.view==='StaffPrefs'));assert.ok(pages.some(s=>s.view==='Prefs'));
});
