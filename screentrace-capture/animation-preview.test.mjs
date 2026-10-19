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
