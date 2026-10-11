import {fixture,node} from './fixture.mjs';
export function flowFixture(ids,edges,routes={}){const data=fixture();data.graph.nodes=ids.map(id=>node(id,'SCREEN',id,{route:routes[id]||`/${id}`}));data.graph.relationships=edges.map(([from,to],i)=>({id:`f${i}`,type:'NAVIGATES_TO',from,to}));data.graph.behaviors=[];return data;}
