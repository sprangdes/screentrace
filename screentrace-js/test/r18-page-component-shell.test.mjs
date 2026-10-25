import test from 'node:test';import assert from 'node:assert/strict';import {analyzeReact} from '../react/analyzer.mjs';
const router="import {Routes,Route,Outlet} from 'react-router-dom';";
const analyze=code=>analyzeReact({files:[{file:'src/App.tsx',code}]});
const view=(result,path)=>result.screens.find(s=>s.route===path)?.view;
test('WP83 shell children select the page despite shell-owned menu and header components',()=>{
 const r=analyze(`${router}function SideMenu(){return <nav/>}function TopStrip(){return <header/>}function Frame({children}){return <div><SideMenu/><TopStrip/><main>{children}</main></div>}function ReportPage(){return <section><h1>報表</h1></section>}function App(){return <Routes><Route path="/report" element={<Frame><ReportPage/></Frame>}/></Routes>}`);
 assert.equal(view(r,'/report'),'ReportPage');
});
test('WP83 children passed through a provider shell skip its internal watcher',()=>{
 const r=analyze(`${router}function Watcher(){return <aside/>}function Provider({children}){return <section><Watcher/>{children}</section>}function Wrapper({children}){return <Provider>{children}</Provider>}function FormBody(){return <form/>}function App(){return <Routes><Route path="/form" element={<Wrapper><FormBody/></Wrapper>}/></Routes>}`);
 assert.equal(view(r,'/form'),'FormBody');
});
test('WP83 pure composition continues through a shell to its only child',()=>{
 const r=analyze(`${router}function Watcher(){return <aside/>}function Provider({children}){return <section><Watcher/>{children}</section>}function Infra({children}){return <Provider><Watcher/>{children}</Provider>}function InnerContent(){return <section><h1>內容</h1></section>}function Outer(){return <Infra><InnerContent/></Infra>}function App(){return <Routes><Route path="/outer" element={<Outer/>}/></Routes>}`);
 assert.equal(view(r,'/outer'),'InnerContent');
});
test('WP83 Outlet shell keeps the child route page component',()=>{
 const r=analyze(`${router}function Frame(){return <div><Outlet/></div>}function ChildPage(){return <h1>子頁</h1>}function App(){return <Routes><Route element={<Frame/>}><Route path="/child" element={<ChildPage/>}/></Route></Routes>}`);
 assert.equal(view(r,'/child'),'ChildPage');
});
