import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyze} from '../analyzer.mjs';

const run = code => analyze({
  sources: [{file: 'app.js', code, screenId: 'screen'}],
  dom: []
});

test('WP44 A2 function parameters remain named route placeholders', () => {
  const result = run("function addToCart(productId){ $http.put('/x/add/'+productId); } addToCart();");
  assert.equal(result.behaviors.find(item => item.type === 'CALL_API')?.url, '/x/add/{productId}');
});

test('WP44 A2 non-computed scope properties use the final property name', () => {
  const result = run("function clearCart(){ $http.delete('/x/cart/'+$scope.cartId); } clearCart();");
  assert.equal(result.behaviors.find(item => item.type === 'CALL_API')?.url, '/x/cart/{cartId}');
});
