import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {snapshotMotionCss} from './template-preview.mjs';
test('static snapshots settle fade-in at its final state while genuine hidden content remains hidden',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.setContent(`<style>@keyframes enter{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.content{animation:enter .3s ease-out}.hidden{opacity:0}${snapshotMotionCss}</style><main class="content">Visible record</main><aside class="hidden">Hidden</aside>`);
 assert.equal(await page.locator('main').evaluate(n=>getComputedStyle(n).opacity),'1');assert.equal(await page.locator('aside').evaluate(n=>getComputedStyle(n).opacity),'0');
 assert.equal(await page.locator('main').evaluate(n=>getComputedStyle(n).transform),'matrix(1, 0, 0, 1, 0, 0)');
 }finally{await browser.close();}
});

test('snapshot collection waits for delayed styles and never executes source scripts',async()=>{
 const {openStaticSnapshot}=await import('./template-preview.mjs');const browser=await chromium.launch();try{
 const context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage();let styled=false;
 await context.route('https://snapshot.invalid/**',async route=>{
  if(route.request().url().endsWith('slow.css')){await new Promise(resolve=>setTimeout(resolve,120));styled=true;await route.fulfill({contentType:'text/css',body:'main{width:123px;height:45px}'});}
  else await route.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="/slow.css"><main>Record</main><script>document.querySelector("main").textContent="Executed"</script>'});
 });
 await openStaticSnapshot(page,'https://snapshot.invalid/');assert.equal(styled,true);assert.equal(await page.locator('main').innerText(),'Record');assert.equal(await page.locator('main').evaluate(n=>n.getBoundingClientRect().width),123);
 }finally{await browser.close();}
});
test('offline icon affordance restores only empty zero-width controls and preserves local glyphs',async()=>{
 const {offlineIconAffordances}=await import('./template-preview.mjs');const browser=await chromium.launch();try{const page=await browser.newPage();await page.setContent('<style>.local::before{content:"+"}.hidden{display:none}</style><a data-st-component-id="one"><i class="fas fa-plus"></i></a><a data-st-component-id="two"><i class="fas fa-plus local"></i></a><a data-st-component-id="three"><i class="fas fa-plus hidden"></i></a>');assert.equal(await offlineIconAffordances(page),1);assert.equal(await page.locator('[data-st-component-id=one] i').textContent(),'◇');assert.equal(await page.locator('[data-st-component-id=two] i').textContent(),'');assert.equal(await page.locator('[data-st-component-id=three] i').textContent(),'');}finally{await browser.close();}
});

test('source autofocus is settled for computed styles with target scripts disabled',async()=>{
 const {settleSourceAutofocus}=await import('./template-preview.mjs');const browser=await chromium.launch();try{const context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage();await page.setContent('<style>input{color:red}input:focus{color:blue}</style><input id="login" autofocus onfocus="document.body.dataset.executed=1"><script>document.body.dataset.executed=1</script>');await page.evaluate(()=>document.activeElement.blur());await settleSourceAutofocus(page);assert.equal(await page.locator('#login').evaluate(n=>document.activeElement===n),true);assert.equal(await page.locator('#login').evaluate(n=>getComputedStyle(n).color),'rgb(0, 0, 255)');assert.equal(await page.locator('body').getAttribute('data-executed'),null);}finally{await browser.close();}
});

test('closed disclosure fallback requires canonical ownership and preserves explicit source display',async()=>{
 const {offlineDisclosureState}=await import('./template-preview.mjs');const browser=await chromium.launch();try{
 const context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage();
 const graph={relationships:[{type:'CONTAINS',from:'s',to:'button'}],behaviors:[{triggerId:'button',evidence:[{parser:'AcornStaticAnalyzer',resolution:'CONFIRMED',detail:JSON.stringify({operation:'toggleDisclosure',selector:'#menu',inputSelector:'#button'})}]}]};
 const html='<button id="button" aria-expanded="false">Menu</button><ul id="menu"><li>Item</li></ul>';
 await page.setContent(html);assert.equal(await offlineDisclosureState(page,graph,'other'),0);assert.equal(await page.locator('#menu').isVisible(),true);
 assert.equal(await offlineDisclosureState(page,graph,'s'),1);assert.equal(await page.locator('#menu').isVisible(),false);assert.equal(await offlineDisclosureState(page,graph,'s'),0);
 await page.setContent('<style>#menu{display:block}</style>'+html);assert.equal(await offlineDisclosureState(page,graph,'s'),0);assert.equal(await page.locator('#menu').isVisible(),true);
 await page.setContent(html);graph.behaviors[0].guard='unknown';assert.equal(await offlineDisclosureState(page,graph,'s'),0);
 graph.behaviors[0].guard=null;graph.behaviors[0].evidence[0].resolution='UNRESOLVED';assert.equal(await offlineDisclosureState(page,graph,'s'),0);
 }finally{await browser.close();}
});
