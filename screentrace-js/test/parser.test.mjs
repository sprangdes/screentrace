import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSource,parseFile} from '../parser.mjs';
import {mkdtemp,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('ES5 and modern module syntax retain source lines',()=>{
 const a=parseSource({file:'legacy.js',code:'var x = function(){ return 1; };'});
 assert.equal(a.ast.body[0].type,'VariableDeclaration');assert.deepEqual(a.diagnostics,[]);
 const b=parseSource({file:'modern.js',code:'\nexport class X { #v=1; value(){ return this?.v ?? 0; } }\nawait Promise.resolve();',module:true});
 assert.equal(b.ast.body[0].loc.start.line,2);assert.equal(b.status,'CONFIRMED');
});
test('syntax error diagnoses and recovers without aborting other source',()=>{
 const a=parseSource({file:'bad.js',code:'const = ;\nfetch("/after");'});
 assert.equal(a.status,'UNRESOLVED');assert.equal(a.diagnostics[0].source.file,'bad.js');assert.equal(a.diagnostics[0].source.line,1);assert.ok(a.ast);
 assert.equal(parseSource({file:'ok.js',code:'fetch("/ok")'}).status,'CONFIRMED');
});
test('side effect probe is parsed but never executed',async()=>{
 delete globalThis.__SCREENTRACE_PROBE__;
 const a=await parseFile(path.resolve('test/fixtures'),'probe.js');
 assert.equal(a.ast.body.length,3);assert.equal(globalThis.__SCREENTRACE_PROBE__,undefined);
});
test('unsafe, missing and oversized files yield diagnostics',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'js-parser-'));await writeFile(path.join(root,'big.js'),' '.repeat(8*1024*1024+1));
 await symlink(path.resolve('test/fixtures/probe.js'),path.join(root,'link.js'));
 for(const file of ['../escape.js','missing.js','link.js','big.js']) {
  const a=await parseFile(root,file);assert.equal(a.status,'UNRESOLVED');assert.equal(a.diagnostics.length,1);
 }
});
