import {parseExpression} from '@babel/parser';

const parsed = new Map();
const parse = value => { if(!parsed.has(value)){if(parsed.size>10000)parsed.clear();parsed.set(value,parseExpression(value,{plugins:['typescript']}));}return parsed.get(value); };
const contradictions=new Map();
const unwrap = node => node?.type==='ParenthesizedExpression' ? unwrap(node.expression) : node;
function code(node) {
 node=unwrap(node);
 if(node.type==='Identifier')return node.name;
 if(['MemberExpression','OptionalMemberExpression'].includes(node.type)){const owner=code(node.object),property=code(node.property);if(owner===null||property===null)return null;return owner+(node.computed?(node.optional?'?.':'')+'['+property+']':(node.optional?'?.':'.')+property);}
 if(node.type==='StringLiteral')return JSON.stringify(node.value);
 if(['NumericLiteral','BooleanLiteral'].includes(node.type))return String(node.value);
 if(node.type==='NullLiteral')return 'null';
 if(node.type==='UnaryExpression'){const argument=code(node.argument);return argument===null?null:node.operator+'('+argument+')';}
 if(['BinaryExpression','LogicalExpression'].includes(node.type)){const left=code(node.left),right=code(node.right);return left===null||right===null?null:'('+left+' '+node.operator+' '+right+')';}
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
   const left=code(n.left)??item.text.slice(n.left.start,n.left.end),right=code(n.right);
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
 function visit(i,current){if(result.length>16)return;if(i===names.length){if(audiences.some(a=>!contradicts([...current,...a]))&&!contradicts(current))result.push(current);return;}
  for(const truth of [false,true]){const next=[...current,{text:names[i],truth,source:audiences.flat().find(a=>a.text===names[i])?.source}];if(!contradicts(next)&&audiences.some(a=>!contradicts([...next,...a])))visit(i+1,next);}}
 visit(0,[]);return {overflow:result.length>16,values:result.length>16?[]:result};
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

/** Display-only reduction. Raw audience atoms and their source evidence are retained. */
export function simplify(items){
 let kept=unique(items);
 // A conjunction of disjunctions may force one of their own leaves, e.g. (a||b)&&(a||!b).
 const leaves=[];function collect(f){if(f.op){collect(f.left);collect(f.right);}else leaves.push(f);}
 for(const item of kept){try{const f=formula(parse(item.text),item.truth,item.text);if(f.op==='or')collect(f);}catch{}}
 for(const leaf of unique(leaves)){const expression=leaf.raw??leaf.text,yes=contradicts([...kept,...atoms(expression)]),no=contradicts([...kept,...atoms('!('+expression+')')]);if(yes===no)continue;const truth=no;if(!kept.some(a=>a.text===leaf.text&&a.truth===truth))kept.push({text:leaf.text,truth,optional:leaf.optional,source:items.find(a=>a.text.includes(leaf.text))?.source??items[0]?.source});}
 kept=unique(kept);
 for(let round=0;round<items.length+1;round++){
  const next=[];
  for(let i=0;i<kept.length;i++){const item=kept[i];let node;try{node=parse(item.text);}catch{}if(node?.type==='LogicalExpression'&&node.operator==='||')next.push(...reduceUnder([item],kept.filter((_,j)=>j!==i)));else next.push(item);}
  const normalized=unique(next);if(JSON.stringify(normalized.map(a=>[a.text,a.truth]))===JSON.stringify(kept.map(a=>[a.text,a.truth])))break;kept=normalized;
 }
 return kept;
}

/** Display/evidence projection under proven assumptions; never changes the original atoms. */
export function reduceUnder(items,facts=[]){
 const result=[];
 for(const item of unique(items)){
  let node;try{node=parse(item.text);}catch{result.push(item);continue;}
  function reduce(n){const expression=item.text.slice(n.start,n.end),known=implied(facts,expression);if(known!==null)return known;
   if(n.type==='LogicalExpression'&&['&&','||'].includes(n.operator)){const a=reduce(n.left),b=reduce(n.right);if(n.operator==='&&'){if(a===false||b===false)return false;if(a===true)return b;if(b===true)return a;}else{if(a===true||b===true)return true;if(a===false)return b;if(b===false)return a;}return `(${a} ${n.operator} ${b})`;}
   if(n.type==='UnaryExpression'&&n.operator==='!'){const value=reduce(n.argument);return typeof value==='boolean'?!value:`!(${value})`;}
   return expression;
  }
  const reduced=reduce(node);if(typeof reduced==='boolean'){if(reduced!==item.truth)result.push(...atoms('false',item.source));}else result.push(...atoms(item.truth?reduced:`!(${reduced})`,item.source));
 }
 return unique(result);
}
