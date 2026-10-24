import {test} from 'node:test';import assert from 'node:assert/strict';import {analyzeReact} from '../react/analyzer.mjs';
function run({body='const result=await fetchAccount();putAccount(result);return result;',extra='',providers='<SessionProvider><App/></SessionProvider>'}={}){
 return analyzeReact({files:[{file:'src/App.tsx',code:`import {createContext,useContext,useState,useCallback,useMemo} from 'react';import {createRoot} from 'react-dom/client';import {Routes,Route,useNavigate} from 'react-router-dom';
 const Session=createContext(null);
 function SessionProvider({children}){const [account,putAccount]=useState(null);const renew=useCallback(async()=>{${body}},[]);${extra}const value=useMemo(()=>({account,renew}),[account,renew]);return <Session.Provider value={value}>{children}</Session.Provider>;}
 function useSession(){const context=useContext(Session);return context;}
 function Home(){if(!account)return <Guest/>;if(account.tier==='CURATOR')return <Desk/>;return null;}function Guest(){return <p>Guest</p>;}function Desk(){return <p>Desk</p>;}
 function Login(){const {renew}=useSession();const go=useNavigate();async function submit(){const person=await renew();if(!person)return;if(person.tier==='CURATOR')go('/');}return <button onClick={submit}>Enter</button>;}
 function App(){return <Routes><Route path='/' element={<Home/>}/><Route path='/login' element={<Login/>}/></Routes>;}createRoot(document.getElementById('root')).render(${providers});`} ]});
}
function homeTargets(r){return r.screens.find(s=>s.route==='/login').components.flatMap(c=>c.behaviors).filter(b=>b.type==='NAVIGATE').flatMap(b=>b.targetScreens??r.screens.filter(s=>(b.targetRoutes??[]).includes(s.route)));}
test('OQ-037 exact Context setter and returned local transfer destination conditions',()=>{const r=run();assert.equal(homeTargets(r).length,1);assert.ok(homeTargets(r)[0].variantKey.includes('CURATOR'));});
for(const [name,options] of [
 ['transformed setter',{body:'const result=await fetchAccount();putAccount(adapt(result));return result;'}],
 ['different returned variable',{body:'const result=await fetchAccount();const other=await fetchOther();putAccount(result);if(flag)return other;return result;'}],
 ['setter through props',{extra:'const control=<Widget change={putAccount}/>;'}],
 ['setter in other function',{extra:'function reset(){putAccount(null);}'}],
 ['multiple Providers',{providers:'<><SessionProvider><App/></SessionProvider><SessionProvider><p/></SessionProvider></>'}],
 ['unknown Provider',{providers:'<App/>'}]
])test('OQ-037 conservative: '+name,()=>assert.equal(homeTargets(run(options)).length,2));
