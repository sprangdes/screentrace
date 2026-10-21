import {calleeName} from './bindings.mjs';
// A finite character class has bounded cost; arbitrary source RegExp is never compiled.
export function keyFilter(node,event='event') {
 const call=node?.type==='ReturnStatement'?node.argument:null;
 if(call?.type!=='CallExpression'||call.arguments.length!==1||call.callee?.type!=='MemberExpression'||call.callee.computed||call.callee.property.name!=='test'||!call.callee.object?.regex||calleeName(call.arguments[0])!==event+'.key')return null;
 const {pattern,flags}=call.callee.object.regex;
 return /^\^?\[[A-Za-z0-9 -]+\]\$?$/.test(pattern)&&pattern.length<=128&&/^(i)?$/.test(flags)?{pattern,flags}:null;
}
export function dependentDate(fn) {
 if(!['FunctionExpression','FunctionDeclaration'].includes(fn?.type))return null;
 const statements=fn.body?.body;if(statements?.length!==3)return null;
 const [decl,step,last]=statements,variable=decl?.declarations?.[0],initial=variable?.init;
 if(decl.type!=='VariableDeclaration'||decl.declarations.length!==1||variable.id.type!=='Identifier'||initial?.type!=='NewExpression'||calleeName(initial.callee)!=='Date'||initial.arguments.length!==1||calleeName(initial.arguments[0])!=='this.value')return null;
 const name=variable.id.name,advance=step.expression,days=advance?.arguments?.[0];
 if(step.type!=='ExpressionStatement'||calleeName(advance?.callee)!==name+'.setDate'||advance.arguments.length!==1||days?.type!=='BinaryExpression'||days.operator!=='+'||calleeName(days.left?.callee)!==name+'.getDate'||days.left.arguments.length||!Number.isInteger(days.right?.value)||days.right.value<1||days.right.value>366)return null;
 const call=last.expression,format=call?.arguments?.[1],split=format?.object,iso=split?.callee?.object;
 if(last.type!=='ExpressionStatement'||call?.type!=='CallExpression'||call.callee?.property?.name!=='setAttribute'||call.arguments.length!==2||call.arguments[0]?.value!=='min'||format?.type!=='MemberExpression'||!format.computed||format.property?.value!==0||split?.type!=='CallExpression'||split.callee?.property?.name!=='split'||split.arguments.length!==1||split.arguments[0]?.value!=='T'||iso?.type!=='CallExpression'||calleeName(iso.callee)!==name+'.toISOString'||iso.arguments.length)return null;
 return {target:call.callee.object,days:days.right.value};
}
export function disclosure(fn) {
 const statements=fn.body?.body;if(!statements||statements.length!==4)return null;
 const [prevent,decl,attribute,branch]=statements,entry=decl.declarations?.[0],test=entry?.init;
 if(prevent.expression?.callee?.property?.name!=='preventDefault'||prevent.expression.arguments.length||decl.type!=='VariableDeclaration'||decl.declarations.length!==1||entry.id.type!=='Identifier'||test?.type!=='BinaryExpression'||test.operator!=='==='||test.right?.value!=='true'||test.left?.callee?.property?.name!=='getAttribute'||test.left.arguments.length!==1||test.left.arguments[0]?.value!=='aria-expanded')return null;
 const expanded=entry.id.name,call=attribute.expression;if(call?.callee?.property?.name!=='setAttribute'||call.arguments.length!==2||call.arguments[0]?.value!=='aria-expanded'||call.arguments[1]?.type!=='UnaryExpression'||call.arguments[1].operator!=='!'||call.arguments[1].argument.name!==expanded||calleeName(call.callee.object)!==calleeName(test.left.callee.object)||branch.type!=='IfStatement'||branch.test?.name!==expanded)return null;
 const effect=block=>block?.body?.length===1?block.body[0].expression:null,yes=effect(branch.consequent),no=effect(branch.alternate);
 if(yes?.callee?.property?.name!=='remove'||no?.callee?.property?.name!=='add'||yes.callee.object?.property?.name!=='classList'||no.callee.object?.property?.name!=='classList'||calleeName(yes.callee.object.object)!==calleeName(no.callee.object.object)||yes.arguments.length!==1||no.arguments.length!==1||yes.arguments[0]?.value!=='show'||no.arguments[0]?.value!=='show')return null;
 return {button:call.callee.object,menu:yes.callee.object.object};
}
export function displayToggle(fn){
 const list=fn.body?.body;if(list?.length!==1||list[0].type!=='IfStatement')return null;
 const branch=list[0],test=branch.test;
 if(test.type!=='LogicalExpression'||test.operator!=='||')return null;
 const a=test.left,b=test.right;if(a.type!=='BinaryExpression'||b.type!=='BinaryExpression'||a.operator!=='==='||b.operator!=='==='||a.right?.value!=='none'||b.right?.value!==''||calleeName(a.left)!==calleeName(b.left)||a.left?.property?.name!=='display'||a.left.object?.property?.name!=='style')return null;
 const assignment=block=>block?.type==='BlockStatement'&&block.body.length===1&&block.body[0].type==='ExpressionStatement'?block.body[0].expression:null;
 const yes=assignment(branch.consequent),no=assignment(branch.alternate);
 if(yes?.type!=='AssignmentExpression'||no?.type!=='AssignmentExpression'||yes.operator!=='='||no.operator!=='='||calleeName(yes.left)!==calleeName(a.left)||calleeName(no.left)!==calleeName(a.left)||yes.right?.value!=='block'||no.right?.value!=='none')return null;
 return a.left.object.object;
}
