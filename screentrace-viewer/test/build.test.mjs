import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const directory=new URL('../',import.meta.url);
test('modern viewer module refuses historical and missing schema',async()=>{const result=await build({entryPoints:[new URL('../src/contracts.ts',import.meta.url).pathname],bundle:true,format:'esm',write:false,platform:'node'});const ownModule=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));assert.throws(()=>ownModule.requireGraph({schemaVersion:'2.1'}),/2\.2.*2\.1/);assert.throws(()=>ownModule.requireGraph({}),/2\.2/);const graph={schemaVersion:'2.2'};assert.equal(ownModule.requireGraph(graph),graph);});
test('bundle and build hash are reproducible and require no runtime modules or fetch',async()=>{const script=await readFile(new URL('../dist/viewer.js',import.meta.url),'utf8');const hash=await readFile(new URL('../dist/viewer.sha256',import.meta.url),'utf8');assert.equal(createHash('sha256').update(script).digest('base64'),hash);assert.doesNotMatch(script,/fetch\(|<\/script|require\(/);execFileSync(process.execPath,['build.mjs'],{cwd:directory});assert.equal(await readFile(new URL('../dist/viewer.js',import.meta.url),'utf8'),script);assert.equal(await readFile(new URL('../dist/viewer.sha256',import.meta.url),'utf8'),hash);});
