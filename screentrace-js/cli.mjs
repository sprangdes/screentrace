import {parseSource} from './parser.mjs';
import {analyze} from './analyzer.mjs';
let input='';for await(const chunk of process.stdin) input+=chunk;
const request=JSON.parse(input);
const sources=[...(request.sources??[])].sort((a,b)=>a.file.localeCompare(b.file)|| (a.line??1)-(b.line??1));
process.stdout.write(JSON.stringify(analyze({...request,sources})));
