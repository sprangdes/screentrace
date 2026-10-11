import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';
import {mdFixture} from './md-fixture.mjs';

/** Fake File System Access pickers and handle store; files, permissions and handles live in localStorage so they survive reloads. */
function fakeFileSystem({supported=true}={}){
 if(!supported){delete window.showSaveFilePicker;delete window.showOpenFilePicker;return;}
 const fake=name=>({kind:'file',name,
  async getFile(){return new File([localStorage.getItem('fake-file:'+name)||''],name);},
  async createWritable(){let buffer='';return {async write(text){buffer+=String(text);},async close(){if(localStorage.getItem('fake-fail')==='1')throw new Error('磁碟已滿');localStorage.setItem('fake-file:'+name,buffer);localStorage.setItem('fake-writes',String(Number(localStorage.getItem('fake-writes')||0)+1));}};},
  async queryPermission(){return localStorage.getItem('fake-perm:'+name)||'prompt';},
  async requestPermission(){localStorage.setItem('fake-perm:'+name,'granted');return 'granted';}});
 window.showSaveFilePicker=async options=>{localStorage.setItem('fake-picked',options.suggestedName);return fake('progress.md');};
 window.showOpenFilePicker=async()=>[fake(localStorage.getItem('fake-open')||'progress.md')];
 window.__screentraceHandleStore={async load(key){const name=localStorage.getItem('fake-handle:'+key);return name?fake(name):undefined;},async save(key,handle){localStorage.setItem('fake-handle:'+key,handle.name);}};
}
async function open(options){
 const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),data=mdFixture(),file=await fileFixture(data);
 page.setDefaultTimeout(5000);
 await page.addInitScript(fakeFileSystem,options);
 await page.goto(file);await page.locator('#app[data-ready="true"]').waitFor();
 return {browser,page,data};
}
const state=page=>page.locator('.save-menu').getAttribute('data-file-state');
const fileText=page=>page.evaluate(()=>localStorage.getItem('fake-file:progress.md')||'');
const machine=md=>JSON.parse(md.split('```json screentrace-review-state\n')[1].split('\n```')[0]);
const decide=async(page,screen,value)=>{await page.locator(`.screen-list [data-screen-list="${screen}"]`).click();await page.locator(`.panel-header .decision-switch [data-decision="${value}"]`).click();};

test('R17 WP65 the first decision asks for a progress file; every later decision is written to it',async()=>{
 const {browser,page}=await open();
 try{
  assert.equal(await state(page),'none');
  await decide(page,'a','KEEP');
  await page.waitForFunction(()=>document.querySelector('.save-menu').open,undefined,{timeout:2000});
  await page.getByRole('button',{name:'選擇存放位置…'}).click();
  await page.waitForFunction(()=>document.querySelector('.save-menu').dataset.fileState==='saved');
  assert.equal(await page.evaluate(()=>localStorage.getItem('fake-picked')),'screentrace-review-測試應用.md');
  assert.deepEqual(machine(await fileText(page)).screen_decisions,{a:'KEEP'});
  await page.locator('.prototype-back').click();
  await decide(page,'b','REMOVE');
  await page.waitForFunction(()=>(localStorage.getItem('fake-file:progress.md')||'').includes('"b":"REMOVE"'));
  const md=await fileText(page);
  assert.equal(machine(md).format_version,1);assert.deepEqual(machine(md).screen_decisions,{a:'KEEP',b:'REMOVE'});
  assert.equal(await page.locator('.save-menu').evaluate(menu=>menu.open),false,'no prompt once a file is set');
  assert.match(await page.locator('.file-state').innerText(),/已自動儲存/);
 }finally{await browser.close();}
});

test('R17 WP65 reopening offers to continue the last progress file and the file wins over browser storage',async()=>{
 const {browser,page,data}=await open();
 try{
  await decide(page,'a','KEEP');await page.getByRole('button',{name:'選擇存放位置…'}).click();
  await page.waitForFunction(()=>document.querySelector('.save-menu').dataset.fileState==='saved');
  await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('screentrace:review:')||key.startsWith('fake-perm:'))localStorage.removeItem(key);});
  await page.reload();await page.locator('#app[data-ready="true"]').waitFor();
  await page.waitForFunction(()=>document.querySelector('.save-menu').dataset.fileState==='pending');
  assert.equal(await page.locator('.screen-list [data-screen-list="a"]').getAttribute('data-decision'),'UNDECIDED');
  assert.equal(await page.locator('.save-menu').evaluate(menu=>menu.open),true);
  await page.getByRole('button',{name:'繼續上次進度：progress.md'}).click();
  await page.waitForFunction(()=>document.querySelector('.save-menu').dataset.fileState==='saved');
  assert.equal(await page.locator('.screen-list [data-screen-list="a"]').getAttribute('data-decision'),'KEEP');
  assert.match(await page.locator('.save-status').innerText(),/已載入上次進度/);
  // A permission that is still granted resumes without asking.
  await page.reload();await page.locator('#app[data-ready="true"]').waitFor();
  await page.waitForFunction(()=>document.querySelector('.save-menu').dataset.fileState==='saved');
  assert.equal(data.graph.application.name,'測試應用');
 }finally{await browser.close();}
});

test('R17 WP65 a failed write keeps decisions in the page and can be retried',async()=>{
 const {browser,page}=await open();
 try{
  await decide(page,'a','KEEP');await page.getByRole('button',{name:'選擇存放位置…'}).click();
  await page.waitForFunction(()=>document.querySelector('.save-menu').dataset.fileState==='saved');
  await page.evaluate(()=>localStorage.setItem('fake-fail','1'));
  await page.locator('.prototype-back').click();await decide(page,'b','REMOVE');
  await page.waitForFunction(()=>document.querySelector('.save-menu').dataset.fileState==='error');
  assert.match(await page.locator('.file-state').innerText(),/儲存失敗/);
  assert.equal(await page.locator('.screen-list [data-screen-list="b"]').getAttribute('data-decision'),'REMOVE');
  await page.evaluate(()=>localStorage.removeItem('fake-fail'));
  await page.locator('.file-state').click();await page.getByRole('button',{name:'重試'}).click();
  await page.waitForFunction(()=>document.querySelector('.save-menu').dataset.fileState==='saved');
  assert.deepEqual(machine(await fileText(page)).screen_decisions,{a:'KEEP',b:'REMOVE'});
 }finally{await browser.close();}
});

test('R17 WP65 "later" stops the prompt, and opening an existing progress file makes it the save target',async()=>{
 const {browser,page}=await open();
 try{
  await decide(page,'a','KEEP');
  await page.getByRole('button',{name:'稍後再說'}).click();
  await page.locator('.prototype-back').click();await decide(page,'b','KEEP');
  assert.equal(await page.locator('.save-menu').evaluate(menu=>menu.open),false);
  assert.equal(await state(page),'none');
  const pending=page.waitForEvent('download');await page.locator('[data-md-export]').click();const md=await (await pending).path().then(p=>import('node:fs/promises').then(f=>f.readFile(p,'utf8')));
  await page.evaluate(([text])=>{localStorage.setItem('fake-file:other.md',text);localStorage.setItem('fake-open','other.md');},[md]);
  await page.locator('.file-state').click();await page.getByRole('button',{name:'開啟 md…'}).click();
  await page.waitForFunction(()=>document.querySelector('.save-menu').dataset.fileState==='saved');
  assert.match(await page.locator('.file-state').getAttribute('title'),/other\.md/);
  await page.locator('.prototype-back').click();await decide(page,'a','REMOVE');
  await page.waitForFunction(()=>(localStorage.getItem('fake-file:other.md')||'').includes('"a":"REMOVE"'));
 }finally{await browser.close();}
});

test('R17 WP65 browsers without the file API fall back to browser storage, download and the file input',async()=>{
 const {browser,page}=await open({supported:false});
 try{
  assert.equal(await state(page),'unsupported');
  await decide(page,'a','KEEP');
  assert.equal(await page.locator('.save-menu').evaluate(menu=>menu.open),false);
  await page.locator('.file-state').click();
  assert.match(await page.locator('.save-panel').innerText(),/不支援自動存檔/);
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'開啟 md…'}).click();await chooser;
 }finally{await browser.close();}
});
