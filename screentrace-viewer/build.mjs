import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
await mkdir(new URL('./dist/',import.meta.url),{recursive:true});
const result=await build({entryPoints:[fileURLToPath(new URL('./src/main.ts',import.meta.url))],bundle:true,write:false,format:'iife',platform:'browser',target:['chrome120','firefox120','safari17'],minify:true,charset:'ascii',legalComments:'none'});
const script=result.outputFiles[0].text;
if(/<\/script/i.test(script))throw Error('Bundle contains an unsafe script terminator');
for(const [name,content] of [['viewer.js',script],['viewer.sha256',createHash('sha256').update(script).digest('base64')],['template.html',await readFile(new URL('./src/template.html',import.meta.url),'utf8')],['viewer.css',await readFile(new URL('./src/viewer.css',import.meta.url),'utf8')]])await writeFile(new URL('./dist/'+name,import.meta.url),content);
