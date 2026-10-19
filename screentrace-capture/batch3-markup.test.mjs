import test from 'node:test';import assert from 'node:assert/strict';
import {markupTokens,markupAttributes,convertControls} from './preview-markup.mjs';
test('nested JSP tag quotes stay atomic and styleId maps to HTML id',()=>{
 const source='<a href="remove.do?id=<bean:write name="row" property="id"/>" onclick="return confirm(\'Remove?\')">Delete</a>';
 const tokens=markupTokens(source);assert.equal(tokens[0].name,'a');assert.equal(markupAttributes(tokens[0].text).onclick,"return confirm('Remove?')");assert.match(markupAttributes(tokens[0].text).href,/property="id"/);
 assert.match(convertControls('<html:text property="name" styleId="field"/>'),/ id="field"/);
});
test('asset attribute replacement does not alter quoted decoys or other attributes',async()=>{
 const {replaceMarkupAttribute}=await import('./preview-markup.mjs');
 const source=`<link title="href='../decoy.css'" href='../css/main.css'>`;
 assert.equal(replaceMarkupAttribute(source,'href','assets/css/main.css'),`<link title="href='../decoy.css'" href='assets/css/main.css'>`);
});
test('reserved metadata removal handles unquoted values and preserves quoted decoys',async()=>{
 const {stripMarkupAttributes}=await import('./preview-markup.mjs');
 const source=`<div title='data-st-demo-row="decoy"' data-st-demo-row=forged class="x">`;
 assert.equal(stripMarkupAttributes(source,k=>k.startsWith('data-st-demo-')),`<div title='data-st-demo-row="decoy"' class="x">`);
});
