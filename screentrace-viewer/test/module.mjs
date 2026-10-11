import {build} from 'esbuild';
export async function ownModule(name){const result=await build({entryPoints:[new URL(`../src/${name}.ts`,import.meta.url).pathname],bundle:true,format:'esm',write:false,platform:'node'});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}
