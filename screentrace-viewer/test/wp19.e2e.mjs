import test from 'node:test';import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';import {fixture,fileFixture,node} from './fixture.mjs';
for(const [scenario,titles,expected] of [
 ['all same',['Shared','Shared','Shared'],['Owner Details','Find Owners','Pet Form']],
 ['partly repeated',['Shared','Shared','Unique'],['Owner Details','Find Owners','Unique']],
 ['all unique',['Details','Search','Create'],['Details','Search','Create']]
])test(`WP19 ${scenario} titles use unique readable names without source paths`,async()=>{
 const data=fixture();data.graph.nodes=['ownerDetails','findOwners','petForm'].map((view,i)=>node(String(i),'SCREEN',view,{view:`src/main/webapp/WEB-INF/jsp/${view}.jsp`,route:`/pages/${i}`}));data.graph.relationships=[];data.documents=Object.fromEntries(titles.map((title,i)=>[String(i),`<html><head><title>${title}</title></head><body>Page</body></html>`]));
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(data));
 assert.deepEqual(await page.locator('.screen-card strong').allTextContents(),expected);assert.equal(new Set(await page.locator('.screen-card strong').allTextContents()).size,3);
 for(let i=0;i<3;i++){const card=page.locator(`.screen-card[data-screen="${i}"]`);assert.doesNotMatch(await card.innerText(),/src\/main\/webapp|WEB-INF|\.jsp/);assert.equal(await card.locator('.screen-route').getAttribute('title'),`/pages/${i}`);}
 }finally{await browser.close();}
});
