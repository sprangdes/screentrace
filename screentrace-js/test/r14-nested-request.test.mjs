import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyze} from '../analyzer.mjs';

test('nested literal API arguments are retained as separate static request sources',()=>{
 const code=`function refreshCart(){fetch('/api/cart/'+cartId);}
function add(){refreshCart(fetch('/api/cart/cartId'));}
$('#save').on('click',function(){add();});`;
 const result=analyze({sources:[{file:'controller.js',code,screenId:'screen'}],dom:[{id:'save',componentId:'save',tag:'button',attrs:{id:'save'},parent:null}]});
 const calls=result.behaviors.filter(item=>item.type==='CALL_API');
 assert.equal(calls.length,2);
 assert.deepEqual(calls.map(item=>item.url).sort(),['/api/cart/cartId','/api/cart/{cartId}']);
 assert.equal(calls.find(item=>item.url==='/api/cart/cartId').status,'CONFIRMED');
 assert.equal(calls.find(item=>item.url==='/api/cart/cartId').source.line,2);
});
