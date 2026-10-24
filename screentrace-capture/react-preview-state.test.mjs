import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import {analyzeReact} from '../screentrace-js/react/analyzer.mjs';

test('R18 WP83 successful-load reconstruction captures only the loaded React state', async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),'st-react-state-')),output=path.join(root,'analysis');
  try {
    await mkdir(path.join(output,'static-preview'),{recursive:true});
    const analyzed=analyzeReact({markup:true,files:[{file:'src/Board.tsx',code:`import {Routes,Route} from 'react-router-dom';import {useEffect,useState} from 'react';
      function Board(){const [pending,setPending]=useState(true);const [problem,setProblem]=useState('');const [records,setRecords]=useState([]);
      useEffect(()=>{async function refresh(){try{const response=await fetch('/api/records');setRecords(response.items);setPending(false);}catch(error){setProblem('offline');}}void refresh();},[]);
      return <>{pending&&<p>Loading records</p>}{problem&&<p>Error records</p>}{!pending&&!problem&&records.length===0&&<p>No records</p>}{!pending&&!problem&&records.map(item=><li>{item.name}</li>)}</>;}
      export default function App(){return <Routes><Route path='/board' element={<Board/>}/></Routes>;}`}]}).screens[0];
    const screenId='screen:board',source={file:'src/Board.tsx',line:1},evidence=[{source,parser:'BabelReactAnalyzer',resolution:'CONFIRMED'}];
    const graph={schemaVersion:'2.3',application:{name:'synthetic',path:'.',technologies:['React']},nodes:[{id:screenId,type:'SCREEN',name:analyzed.name,attributes:{route:analyzed.route,view:analyzed.view,viewSource:analyzed.viewSource,rendering:'static-reconstruction'},source,confidence:'CONFIRMED',evidence}],relationships:[],behaviors:[],validationRules:[]};
    await writeFile(path.join(output,'application-graph.json'),JSON.stringify(graph));
    await writeFile(path.join(output,'static-preview/react-preview.json'),JSON.stringify({stylesheets:[],screens:{[screenId]:analyzed.markup}}));
    const child=spawn(process.execPath,[path.resolve('screentrace-capture/capture-static-jsp.mjs'),root,output,'--preview-v2']);let error='';child.stderr.on('data',chunk=>error+=chunk);child.stdout.resume();
    const status=await new Promise(resolve=>child.on('close',resolve));assert.equal(status,0,error);
    const html=await readFile(path.join(output,'static-preview',`${screenId.replace(/[^a-z0-9-]/gi,'_')}.html`),'utf8');
    assert.match(html,/<li>/);assert.doesNotMatch(html,/Loading records|Error records|No records/);
  } finally {await rm(root,{recursive:true,force:true});}
});
