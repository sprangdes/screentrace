import {parseExpression} from '@babel/parser';

const parsed = new Map();
const parse = value => { if(!parsed.has(value)){if(parsed.size>10000)parsed.clear();parsed.set(value,parseExpression(value,{plugins:['typescript']}));}return parsed.get(value); };
const contradictions=new Map();
const unwrap = node => node?.type==='ParenthesizedExpression' ? unwrap(node.expression) : node;
function code(node) {
 node=unwrap(node);
 if(node.type==='Identifier')return node.name;
 if(['MemberExpression','OptionalMemberExpression'].includes(node.type))return code(node.object)+(node.computed?(node.optional?'?.':'')+'['+code(node.property)+']':(node.optional?'?.':'.')+code(node.property));
 if(node.type==='StringLiteral')return JSON.stringify(node.value);
 if(['NumericLiteral','BooleanLiteral'].includes(node.type))return String(node.value);
 if(node.type==='NullLiteral')return 'null';
 if(node.type==='UnaryExpression')return node.operator+'('+code(node.argument)+')';
 if(['BinaryExpression','LogicalExpression'].includes(node.type))return '('+code(node.left)+' '+node.operator+' '+code(node.right)+')';
 return null;
}
function formula(node,truth,original) {
 node=unwrap(node);
 if(node.type==='UnaryExpression' && node.operator==='!')return formula(node.argument,!truth,original);
 if(node.type==='LogicalExpression' && ['&&','||'].includes(node.operator))return {op:(node.operator==='&&')===truth?'and':'or',left:formula(node.left,truth,original),right:formula(node.right,truth,original)};
 let expr=code(node)??original.slice(node.start,node.end), positive=truth;
 if(node.type==='BinaryExpression' && ['===','!=='].includes(node.operator)) {
  expr=(code(node.left)??original.slice(node.left.start,node.left.end))+' === '+(code(node.right)??original.slice(node.right.start,node.right.end));
  if(node.operator==='!==')positive=!positive;
 }
 return {text:expr.replaceAll('?.','.'),truth:positive,optional:expr.includes('?.'),raw:expr};
}
function print(f){return f.op?'('+print(f.left)+(f.op==='and'?' && ':' || ')+print(f.right)+')':f.truth?(f.raw??f.text):'!('+(f.raw??f.text)+')';}
export function atoms(expression,source) {
 if(!expression)return [];
 let f;try{f=formula(parse(expression),true,expression);}catch{return [{text:expression,truth:true,source}];}
 const flatten=f=>f.op==='and'?[...flatten(f.left),...flatten(f.right)]:[{...(f.op?{text:print(f),truth:true}:{text:f.text,truth:f.truth,optional:f.optional}),source}];
 return unique(flatten(f));
}
export function unique(items){const seen=new Map();for(const item of items)seen.set(item.text+'\0'+item.truth,seen.get(item.text+'\0'+item.truth)??item);return [...seen.values()].sort((a,b)=>a.text.localeCompare(b.text)||Number(a.truth)-Number(b.truth));}
function rows(f) {
 if(!f.op)return [[f]];
 const a=rows(f.left),b=rows(f.right);
 if(a.length*b.length>256)return [[{text:print(f),truth:true}]];
 return f.op==='or'?[...a,...b]:a.flatMap(x=>b.map(y=>[...x,...y]));
}
function clash(items){
 const values=new Map(),equals=new Map(),falseObjects=[];
 for(const item of items){
  if(values.has(item.text) && values.get(item.text)!==item.truth)return true;
  values.set(item.text,item.truth);
  let n;try{n=parse(item.text);}catch{continue;}
  if(n.type==='BooleanLiteral' && n.value!==item.truth)return true;
  if(n.type==='Identifier' && !item.truth)falseObjects.push(n.name);
  if(n.type==='BinaryExpression' && n.operator==='===' && item.truth && ['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(n.right.type)){
   const left=code(n.left),right=code(n.right);
   if(equals.has(left)&&equals.get(left)!==right)return true;
   equals.set(left,right);
  }
 }
 for(const name of falseObjects)for(const item of items){
  let n;try{n=parse(item.text);}catch{continue;}
  const member=n.type==='BinaryExpression'?n.left:n;
  if(!['MemberExpression','OptionalMemberExpression'].includes(member.type))continue;
  let root=member;while(['MemberExpression','OptionalMemberExpression'].includes(root.type))root=root.object;
  if(root.type!=='Identifier'||root.name!==name)continue;
  // Direct access cannot be evaluated on a false object. Optional equality to a defined literal is false.
  // Optional syntax is normalized away; equality to undefined is deliberately excluded.
  if(n.type==='BinaryExpression' && n.operator==='===' && ['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(n.right.type) && item.truth)return true;
  if(!item.optional && ['MemberExpression','OptionalMemberExpression'].includes(member.type))return true;
 }
 return false;
}
export function contradicts(items) {
 const key=items.map(x=>x.text+'\0'+x.truth+'\0'+x.optional).sort().join('\u0001');
 if(contradictions.has(key))return contradictions.get(key);
 const value=contradictsUncached(items);if(contradictions.size>10000)contradictions.clear();contradictions.set(key,value);return value;
}
function contradictsUncached(items) {
 let alternatives=[[]];
 for(const item of items){let f;try{f=formula(parse(item.text),item.truth,item.text);if(!f.op&&item.optional!==undefined)f.optional=item.optional;}catch{f=item;}
  const next=rows(f);if(alternatives.length*next.length>256)return false;
  alternatives=alternatives.flatMap(a=>next.map(b=>[...a,...b])).filter(a=>!clash(a));if(!alternatives.length)return true;
 }
 return false;
}
export function implied(facts,expression,source={file:'.',line:1}){
 const yes=atoms(expression,source),no=atoms('!('+expression+')',source);
 if(contradicts([...facts,...yes]))return false;
 if(contradicts([...facts,...no]))return true;
 return null;
}
export function combinations(audiences){
 const names=[...new Set(audiences.flat().map(a=>a.text))].sort(),result=[];
 // Stop as soon as 17 satisfiable combinations are found; never enumerate an exponential full product.
 let visits=0;
 function visit(i,current){if(++visits>2048||result.length>16)return;if(i===names.length){if(audiences.some(a=>!contradicts([...current,...a]))&&!contradicts(current))result.push(current);return;}
  for(const truth of [false,true]){const next=[...current,{text:names[i],truth}];if(!contradicts(next))visit(i+1,next);}}
 if(names.length>24)return {overflow:true,values:[]};
 visit(0,[]);return {overflow:visits>2048||result.length>16,values:visits>2048||result.length>16?[]:result};
}

export function residualGuard(guard,facts){
 if(!guard||!facts.length)return guard;
 const parts=[];
 let node;try{node=parse(guard);}catch{return guard;}
 function walk(n){if(n.type==='LogicalExpression'&&n.operator==='&&'){walk(n.left);walk(n.right);}else parts.push(guard.slice(n.start,n.end));}
 walk(node);
 const kept=parts.filter(part=>implied(facts,part)!==true);
 return kept.length===parts.length?guard:kept.length?kept.join(' && '):null;
}
