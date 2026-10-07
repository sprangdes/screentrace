import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,node} from './fixture.mjs';
import {simulationFixture} from './wp26-fixture.mjs';

function tenScreenFixture(){
 const data=simulationFixture();
 for(let i=3;i<10;i++){
  const id=`petclinic-${i}`;
  const name=['Owner Search Results and Matching Records','Create or Update Owner Information','Visit Details and Appointment History','Veterinarian Directory and Specialty List','Pet Information and Medical Records','Add Visit for Existing Pet','Owner Details with Registered Pets'][i-3];
  data.graph.nodes.push(node(id,'SCREEN',name,{route:`/owners/${i}/details`}));
  data.preview.screens.push({graphScreenId:id,width:1280,height:900});
  data.documents[id]=`<html><body>${name}</body></html>`;
 }
 return data;
}

test('compact ten-screen overview keeps each full name label inside its card without overlap',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await page.goto(await fileFixture(tenScreenFixture()));
  for(let i=0;i<20;i++){
   const zoom=await page.locator('.world').evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
   if(zoom<.7)break;
   await page.getByRole('button',{name:'縮小'}).click();
  }
  const zoom=await page.locator('.world').evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
  assert.ok(zoom<.7,`expected fit-to-window compact zoom, got ${zoom}`);
  const labels=await page.locator('.screen-card').evaluateAll(cards=>cards.map(card=>{
   const c=card.getBoundingClientRect(),label=card.querySelector('.screen-caption').getBoundingClientRect();
   return {name:card.querySelector('strong').textContent,card:{left:c.left,right:c.right,top:c.top,bottom:c.bottom},label:{left:label.left,right:label.right,top:label.top,bottom:label.bottom,width:label.width},lineClamp:getComputedStyle(card.querySelector('strong')).webkitLineClamp};
  }));
  assert.equal(labels.length,10);
  for(const {name,card,label} of labels){
   assert.ok(label.left>=card.left-1&&label.right<=card.right+1&&label.top>=card.top-1&&label.bottom<=card.bottom+1,`${name} label extends outside its card: ${JSON.stringify({card,label})}`);
   assert.ok(label.width<=card.right-card.left+1,`${name} label is wider than its card`);
  }
  for(const {name,lineClamp} of labels)assert.equal(lineClamp,'2',`${name} must be limited to two lines`);
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
   const a=labels[i].label,b=labels[j].label;
   const overlaps=a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
   assert.equal(overlaps,false,`${labels[i].name} and ${labels[j].name} labels overlap`);
  }
 }finally{await browser.close();}
});

test('hover exposes the complete screen name and URL for compact labels',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await page.goto(await fileFixture(tenScreenFixture()));
  const card=page.locator('.screen-card[data-screen="petclinic-3"]');
  await card.hover();
  assert.match(await card.getAttribute('title')||'',/Owner Search Results and Matching Records/);
  assert.match(await card.getAttribute('title')||'',/\/owners\/3\/details/);
 }finally{await browser.close();}
});
