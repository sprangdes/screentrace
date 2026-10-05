import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from '../test/fixture.mjs';
import {expandedNavigationFixture} from '../test/wp34-global-navigation-fixture.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.join(root,'docs/reports/images');
const target=path.join(output,'overview-global-nav.png');

async function main(){
 await mkdir(output,{recursive:true});
 const browser=await chromium.launch({args:['--disable-gpu','--disable-lcd-text','--font-render-hinting=none','--force-color-profile=srgb']});
 try{
  const url=await fileFixture(expandedNavigationFixture()),page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1,locale:'zh-TW',reducedMotion:'reduce'}),requests=[];
  page.on('request',request=>{if(!request.url().startsWith('file:')&&!request.url().startsWith('data:')&&!request.url().startsWith('blob:'))requests.push(request.url());});
  await page.goto(url);await page.locator('#app[data-ready="true"]').waitFor();
  await page.locator('.canvas[data-fitted="true"]').waitFor();
  await page.getByRole('checkbox',{name:'顯示全站導覽'}).check();
  await page.waitForFunction(()=>document.querySelectorAll('.relation-line.global-navigation').length===12);
  assert.equal(await page.locator('.navigation-statistics').innerText(),'流程 4／全站導覽 12／全部 16');
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}'});
  await page.mouse.move(1439,899);await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:target,animations:'disabled'});
  assert.deepEqual(requests,[]);assert.ok((await readFile(target)).length>1000);
 }finally{await browser.close();}
}

main().catch(error=>{console.error(error);process.exitCode=1;});
