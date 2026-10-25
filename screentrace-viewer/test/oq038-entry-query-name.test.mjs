import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';import {node} from './fixture.mjs';
test('OQ-038 a query-entry variant is named apart by its entry query while the plain entry keeps its name',async()=>{
 const m=await ownModule('names');
 const plain=node('plain','SCREEN','signin',{view:'SignIn',route:'/signin'}),query=node('query','SCREEN','signin',{view:'SignIn',route:'/signin',entryQuery:'sso=err|ok'});
 const hints=new Map([['plain',{heading:'Sign in'}],['query',{heading:'Sign in'}]]),routes=new Map([['plain',['/signin']],['query',['/signin']]]);
 const names=m.screenNames([plain,query],hints,routes);
 assert.equal(names.get('plain'),'Sign in');
 assert.equal(names.get('query'),'Sign in（?sso=err|ok）');
});
