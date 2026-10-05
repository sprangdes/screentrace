import {fixture,node} from './fixture.mjs';

export function expandedNavigationFixture(){
 const data=fixture(),screens=['s0','s1','s2','s3'];
 data.graph.nodes=screens.map((id,i)=>node(id,'SCREEN',`Screen ${i}`,{route:`/screen-${i}`}));
 data.graph.relationships=[];
 const navItems=[['Home','s0','/'],['Find owners','s1','/owners/find'],['Veterinarians','s2','/vets']];
 for(const [screenIndex,screenId] of screens.entries()){
  for(const [itemIndex,[name,destination,href]] of navItems.entries()){
   const id=`nav-${screenId}-${itemIndex}`;
   data.graph.nodes.push(node(id,'COMPONENT',name,{kind:'LINK',tag:'a',componentType:'NAVIGATION',href,target:href,expansionAnchor:`${screenId}:menu:${itemIndex}:line-${screenIndex+1}`}));
   data.graph.relationships.push({id:`owns-${id}`,type:'CONTAINS',from:screenId,to:id},{id:`go-${id}`,type:'NAVIGATES_TO',from:id,to:destination});
  }
  const id=`specific-${screenId}`,destination='s3';
  data.graph.nodes.push(node(id,'COMPONENT',`Edit ${screenIndex}`,{kind:'LINK',tag:'a',href:`/screen-${screenIndex}/edit`}));
  data.graph.relationships.push({id:`owns-${id}`,type:'CONTAINS',from:screenId,to:id},{id:`go-${id}`,type:'NAVIGATES_TO',from:id,to:destination});
 }
 return data;
}
