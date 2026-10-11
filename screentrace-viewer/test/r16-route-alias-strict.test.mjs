import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';
import {fixture} from './fixture.mjs';

test('R16 confirmed navigation accepts a route alias recorded on its destination screen',async()=>{
  const {graph}=fixture();
  const source=graph.nodes.find(node=>node.id==='shared');
  source.attributes.target='/save.do';
  const target=graph.nodes.find(node=>node.id==='b');
  target.attributes.routeAliases='/save.do';
  graph.relationships=graph.relationships.map(edge=>({...edge,confidence:'CONFIRMED',evidence:[{source:{file:'page.jsp',line:1},parser:'StrutsProjectAnalyzer',resolution:'CONFIRMED',detail:'route alias'}]}));
  const module=await ownModule('shared/strict-graph');
  assert.equal(module.strictGraph(graph),graph);
});
