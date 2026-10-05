import test from 'node:test';import assert from 'node:assert/strict';import * as m from './element-styles.mjs';
test('WP29 only unmapped operables receive one of the five evidence-based reasons',()=>{
 const base={tag:'a',componentResolution:'UNRESOLVED',graphComponentCandidates:[]};
 for(const [item,reason] of [[base,'NO_GRAPH_COMPONENT'],[{...base,componentResolution:'AMBIGUOUS',graphComponentCandidates:['a','b']},'AMBIGUOUS_CANDIDATES'],[{...base,source:{file:'part.tag',line:1}},'ANCHOR_MISSING'],[{...base,source:{file:'${unknown}',line:1}},'DYNAMIC_OR_UNRESOLVED_SOURCE'],[{...base,componentResolution:'unexpected'},'OTHER']])assert.equal(m.unmappedReason(item),reason);
 assert.equal(m.unmappedReason({...base,tag:'div'}),undefined);assert.equal(m.unmappedReason({...base,graphComponentId:'c',componentResolution:'INFERRED'}),undefined);
});

test('WP29 capture waits for pending font completion before measuring styles',async()=>{
 const {chromium}=await import('playwright');let browser,release,timer;
 try{browser=await chromium.launch();const context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage();const gate=new Promise(r=>release=r),started=new Promise(r=>{page.route('https://synthetic.invalid/late-font.woff2',async route=>{r();await gate;await route.fulfill({status:200,contentType:'font/woff2',body:Buffer.from('self-written-invalid-font')});});});
 await page.setContent('<style>@font-face{font-family:Delayed;src:url(https://synthetic.invalid/late-font.woff2)}button{font:32px Delayed,monospace}</style><button>Own synthetic fixture</button>',{waitUntil:'domcontentloaded'});await started;
 const guardedContext={newPage:async()=>{assert.equal(await page.evaluate(()=>document.fonts.status),'loaded','raw styles must not be collected during font loading');return context.newPage();}};
 timer=setTimeout(release,500);
 const data=await m.collectElementStyles(page,guardedContext,{schemaVersion:'2.2',nodes:[],relationships:[]},'screen');assert.equal(data.elements.find(e=>e.tag==='button').unmappedReason,'NO_GRAPH_COMPONENT');
 }finally{clearTimeout(timer);release?.();await browser?.close();}
});
