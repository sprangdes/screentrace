import {parseExpression} from '@babel/parser';
import {atoms,unique} from './audience.mjs';

/** Partial boolean evaluation for the current fixed router pathname; target code is never executed. */
export function resolveRouteFacts(facts,evaluator){
 return unique(facts.flatMap(fact=>{
  const scope=evaluator.transferContext.scopeOf(fact);if(!scope)return [fact];
  let root,expression=fact.raw??fact.text;try{root=parseExpression(expression,{plugins:['typescript']});const expanded=evaluator.expandAudience(root,{...scope,module:{...scope.module,code:expression}});if(expanded!==null){expression=expanded;root=parseExpression(expression,{plugins:['typescript']});}}catch{return [fact];}
  function fold(node){
   const value=evaluator.evaluate(node,scope);
   if(value.t==='lit'&&typeof value.v==='boolean')return value.v;
   if(node.type==='LogicalExpression'&&['&&','||'].includes(node.operator)){
    const a=fold(node.left),b=fold(node.right);
    if(node.operator==='&&'){if(a===false||b===false)return false;if(a===true)return b;if(b===true)return a;}
    else{if(a===true||b===true)return true;if(a===false)return b;if(b===false)return a;}
    return `(${a} ${node.operator} ${b})`;
   }
   if(node.type==='UnaryExpression'&&node.operator==='!'){const x=fold(node.argument);return typeof x==='boolean'?!x:`!(${x})`;}
   return expression.slice(node.start,node.end);
  }
  const value=fold(root),resolved=typeof value==='boolean'?value===fact.truth?[]:atoms('false',fact.source):atoms(fact.truth?value:`!(${value})`,fact.source);
  for(const atom of resolved){if(fact.optional===true)atom.optional=true;if(fact.origins)atom.origins=fact.origins;}return evaluator.transferContext.remember(resolved,scope);
 }));
}
