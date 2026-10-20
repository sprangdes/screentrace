import {parseSource} from './parser.mjs';
import {calleeName} from './bindings.mjs';
const ast=code=>parseSource({file:'shape.js',code}).ast;
export const signature=node=>JSON.stringify(node,(key,value)=>['start','end','loc','raw'].includes(key)?undefined:value);
const same=(a,b)=>signature(a)===signature(b);
const shape=code=>ast(code).body;
// Complete ASTs, including loop bounds and the exact predicates; source functions are never invoked.
const trimShapes=shape(`function ltrim(str){if(str.length==0)return(str);else{var idx=0;while(str.charAt(idx).search(/\\s/)==0)idx++;return(str.substr(idx));}}function rtrim(str){if(str.length==0)return(str);else{var idx=str.length-1;while(str.charAt(idx).search(/\\s/)==0)idx--;return(str.substring(0,idx+1));}}function trim(str){return(rtrim(ltrim(str)));}`);
export function trimHelpers(sources){
 const declarations=new Map();for(const unit of sources){const parsed=parseSource(unit);if(parsed.status!=='CONFIRMED')continue;for(const fn of parsed.ast.body)if(fn.type==='FunctionDeclaration'){const key=unit.screenId+':'+fn.id.name;declarations.set(key,declarations.has(key)?null:fn);}}
 return screen=>trimShapes.every(fn=>same(fn,declarations.get(screen+':'+fn.id.name)));
}
const returnedAlert=node=>node?.type==='BlockStatement'&&node.body.length===2&&node.body[0].expression?.type==='CallExpression'&&calleeName(node.body[0].expression.callee)==='alert'&&node.body[0].expression.arguments.length===1&&typeof node.body[0].expression.arguments[0].value==='string'&&node.body[1].type==='ReturnStatement'&&!node.body[1].argument?node.body[0].expression.arguments[0].value:null;
export function workflowGate(fn,{trimProven,domReference}){
 const statements=fn.body?.body;if(!statements?.length)return null;
 const checks=[];let index=0,countName;
 // A count of checked controls plus the index of its selected entry.
 if(statements[0].type==='VariableDeclaration'&&statements[1]?.type==='VariableDeclaration'&&statements[2]?.type==='ForStatement'){
  const count=statements[0].declarations[0],selected=statements[1].declarations[0],loop=statements[2],counter=loop.init?.declarations?.[0];
  if(!count?.id?.name||!selected?.id?.name||!counter?.id?.name||[count.id.name,selected.id.name,counter.id.name].some(n=>!/^[$A-Z_a-z][$\w]*$/.test(n)))return null;
  const call=loop.test?.right?.object,ref=domReference(call);if(!ref||calleeName(call.callee)!=='document.getElementsByName'||typeof call.arguments[0]?.value!=='string')return null;
  const name=JSON.stringify(call.arguments[0].value),c=count.id.name,j=selected.id.name,i=counter.id.name;
  const expected=shape(`var ${c}=0;var ${j}=0;for(var ${i}=0;${i}<document.getElementsByName(${name}).length;${i}++){if(document.getElementsByName(${name})[${i}].checked){${j}=${i};${c}++;}}`);
  if(!same(statements.slice(0,3),expected))return null;
  const zero=statements[3],many=statements[4],noneMessage=returnedAlert(zero?.consequent),manyMessage=returnedAlert(many?.consequent);
  if(zero?.alternate||many?.alternate||!noneMessage||!manyMessage||!same(zero.test,shape(`if(${c}==0){}`)[0].test)||!same(many.test,shape(`if(${c}>1){}`)[0].test))return null;
  checks.push({kind:'selection',selector:ref.selector,min:1,max:1,message:noneMessage,maximumMessage:manyMessage});index=5;countName=c;
 }
 while(index<statements.length){
  const branch=statements[index],test=branch.test;
  if(branch.type!=='IfStatement'||branch.alternate||!['==','==='].includes(test?.operator)||test.right?.value!==''||test.left?.type!=='CallExpression'||calleeName(test.left.callee)!=='trim'||test.left.arguments.length!==1||!trimProven)break;
  const argument=test.left.arguments[0],ref=argument?.property?.name==='value'&&domReference(argument.object),body=branch.consequent.body;
  if(!ref||body?.length!==3||body[0].expression?.callee?.name!=='alert'||body[0].expression.arguments.length!==1||typeof body[0].expression.arguments[0].value!=='string'||body[1].expression?.callee?.property?.name!=='focus'||body[1].expression.arguments.length||!same(body[1].expression.callee.object,argument.object)||body[2].type!=='ReturnStatement'||body[2].argument)return null;
  checks.push({kind:'required',selector:ref.selector,message:body[0].expression.arguments[0].value});index++;
 }
 if(!checks.length)return null;
 let remaining=statements.slice(index).filter(s=>s.type!=='EmptyStatement');
 if(countName&&remaining.length===1&&remaining[0].type==='IfStatement'&&!remaining[0].alternate&&same(remaining[0].test,shape(`if(${countName}==1){}`)[0].test))remaining=remaining[0].consequent.body;
 // Only a complete single destination is eligible; no arbitrary statements or effects are dropped.
 if(remaining.length!==1||!(remaining[0].type==='WithStatement'||remaining[0].type==='ExpressionStatement'&&remaining[0].expression.type==='AssignmentExpression'&&['window.self.location','window.location.href','location.href'].includes(calleeName(remaining[0].expression.left))))return null;
 return {checks,remaining};
}
