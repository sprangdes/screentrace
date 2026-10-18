import {chromium} from '../../../screentrace-capture/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),out=path.join(root,'analyze/workflows-20261018');
const g=JSON.parse(await readFile(path.join(out,'MyStrutsApp/application-graph.json'))),screen=g.nodes.find(n=>n.type==='SCREEN'&&n.attributes.view==='web/AddBook.jsp');
const browser=await chromium.launch({headless:true});let result;
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});await page.goto(pathToFileURL(path.join(out,'MyStrutsApp/report/screentrace-report.html')).href);await page.locator('#app[data-ready="true"]').waitFor();await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');await page.locator(`.screen-card[data-screen="${screen.id}"]`).dblclick();await page.locator('.preview[aria-busy="false"]').waitFor();
 const frame=page.frameLocator('iframe').first(),fields=['ISBNNumber','title','author','publication','edition','category','price'];
 const before={};
 for(const name of fields){const el=frame.locator(`input[name="${name}"],input[property="${name}"]`).first();await el.fill('ScreenTrace test');before[name]=await el.inputValue();}
 const button=frame.locator('button[value="clear"],input[value="clear"]').first();
 const markup=await button.evaluate(n=>({tag:n.localName,text:n.textContent,value:n.getAttribute('value'),type:n.type,html:n.outerHTML}));
 await page.screenshot({path:path.join(out,'screenshots/O06-followup-before.png')});await button.click();await page.waitForTimeout(200);await page.locator('.preview[aria-busy="false"]').waitFor();
 const after={};for(const name of fields)after[name]=await frame.locator(`input[name="${name}"],input[property="${name}"]`).first().inputValue();
 result={id:'O06',result:'FAIL',before,after,renderedButton:markup,originalExpected:{buttonType:'button',visibleLabel:'clear',fieldsAfter:'all empty; no form submission'},status:await page.locator('.prototype-status').allTextContents(),choices:await page.locator('.simulation-choice').allInnerTexts(),note:'Identify editable controls by retained original property when the renderer failed to emit name. No DOM or target code modifications.'};
 await page.screenshot({path:path.join(out,'screenshots/O06-followup-after.png')});
}finally{await browser.close();if(result){await writeFile(path.join(here,'clear-followup.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}}
