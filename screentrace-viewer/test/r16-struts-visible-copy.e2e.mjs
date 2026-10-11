import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';

const reports=(process.env.R16_STRUTS_REPORTS||'').split(process.platform==='win32'?';':':').filter(Boolean);
test('R16 all eight Struts reports keep raw tag syntax and internal attributes out of visible copy', async()=>{
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage(),sources=reports.length===8?reports.map(report=>pathToFileURL(report).href):await Promise.all(Array.from({length:8},()=>fileFixture(fixture())));
    for(const report of sources){
      await page.goto(report);
      await page.waitForFunction(()=>document.querySelector('#app')?.dataset.ready==='true');
      const violations=await page.evaluate(()=>{
        const forbidden=/(?:data-st-|<bean:|<s:|<h:|<f:|<html:)/i,found=[];
        const visible=document.body.innerText;
        if(forbidden.test(visible))found.push(`visible text: ${visible.match(forbidden)?.[0]}`);
        for(const element of document.querySelectorAll('[title],[alt],[aria-label]'))for(const attribute of ['title','alt','aria-label']){
          const value=element.getAttribute(attribute);if(value&&forbidden.test(value))found.push(`${attribute}: ${value.match(forbidden)?.[0]}`);
        }
        return found;
      });
      assert.deepEqual(violations,[],report);
    }
    const malicious=fixture(),rawScreen=node('raw-screen','SCREEN','<s:message key="layout.title" data-st-source-file="layout.jsp"/>');delete rawScreen.source;malicious.graph.nodes.push(rawScreen,node('raw-component','COMPONENT','<h:outputText data-st-id="internal"/>',{kind:'BUTTON',tag:'html:link',name:'<bean:message key="button"/>',visibleText:'<s:message key="layout.title" data-st-source-file="layout.jsp"/>'}));malicious.graph.relationships.push({id:'raw-contains',type:'CONTAINS',from:'raw-screen',to:'raw-component'});malicious.preview.screens.push({graphScreenId:'raw-screen',width:1280,height:900});malicious.documents['raw-screen']='<html><body><a id="raw-component">Link</a></body></html>';
    await page.goto(await fileFixture(malicious));await page.waitForFunction(()=>document.querySelector('#app')?.dataset.ready==='true');
    const violations=await page.evaluate(()=>{const forbidden=/(?:data-st-|<bean:|<s:|<h:|<f:|<html:)/i,values=[document.body.innerText,...[...document.querySelectorAll('[title],[alt],[aria-label]')].flatMap(element=>['title','alt','aria-label'].map(attribute=>element.getAttribute(attribute)||''))];return values.filter(value=>forbidden.test(value));});
    assert.deepEqual(violations,[],'malformed source label must fall back to safe readable text');
  }finally{await browser.close();}
});
