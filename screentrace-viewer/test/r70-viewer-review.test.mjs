import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fixture } from './fixture.mjs';
import { chromium } from '../../screentrace-capture/node_modules/playwright/index.mjs';

async function browserModule(name, globalName = 'viewerModule') {
  const result = await build({
    entryPoints: [new URL(`../src/${name}.ts`, import.meta.url).pathname],
    bundle: true,
    format: 'iife',
    globalName,
    write: false,
  });
  return result.outputFiles[0].text;
}

test('RV-601 markup the lexical pass reads differently keeps no live fetching attribute', async () => {
  const source = await browserModule('inert-document');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: source });
    const live = await page.evaluate(
      (cases) => {
        const out = {};
        for (const [label, html] of Object.entries(cases)) {
          const doc = window.viewerModule.inertDocument(html);
          out[label] = [...doc.querySelectorAll('*')].flatMap((node) =>
            [...node.attributes]
              .filter((attr) => /^(src|srcset|href|poster|data|background)$/i.test(attr.name))
              .map((attr) => `${node.tagName.toLowerCase()} ${attr.name}=${attr.value}`),
          );
        }
        return out;
      },
      {
        abruptComment: '<!--><img src="http://example.test/a">',
        bangComment: '<!-- x --!><img src="http://example.test/b">',
        rawTextEnd: `<title><a title="</title><img src='http://example.test/c'>"></title>`,
        nbspBeforeQuote: '<img alt= "x src=http://example.test/d">',
        verticalTab: '<img alt=\v"x src=http://example.test/e">',
        kept: '<a href="next.do">n</a><img src="data:image/png;base64,AA"><img src="http://example.test/f">',
      },
    );
    assert.deepEqual(live, {
      abruptComment: [],
      bangComment: [],
      rawTextEnd: [],
      nbspBeforeQuote: [],
      verticalTab: [],
      kept: ['a href=next.do', 'img src=data:image/png;base64,AA'],
    });
  } finally {
    await browser.close();
  }
});

test('RV-605 a relation tooltip lists ten triggers and counts the rest', async () => {
  const [relations, map] = await Promise.all([
    browserModule('relations', 'relations'),
    browserModule('map', 'map'),
  ]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: relations });
    await page.addScriptTag({ content: map });
    const shown = await page.evaluate((graph) => {
      const index = window.map.indexGraph(graph),
        triggers = Array.from({ length: 12 }, (_, i) => 'trigger-' + i),
        tip = window.relations.relationTooltip(
          index,
          { preview: { screens: [] } },
          {
            from: 'a',
            to: 'b',
            triggers,
            behaviorIds: [],
          },
        );
      return { rows: tip.querySelectorAll(':scope > div').length, last: tip.lastChild.textContent };
    }, fixture().graph);
    assert.equal(shown.rows, 10);
    assert.match(shown.last, /2/);
  } finally {
    await browser.close();
  }
});

test('RV-606 preview records under a prefixed tag such as html:form reach their element', async () => {
  const [labels, map] = await Promise.all([
    browserModule('labels', 'labels'),
    browserModule('map', 'map'),
  ]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: labels });
    await page.addScriptTag({ content: map });
    const marked = await page.evaluate((graph) => {
      const doc = new DOMParser().parseFromString(
          '<html:form action="save.do"><input name="q"></html:form>',
          'text/html',
        ),
        index = window.map.indexGraph(graph);
      window.labels.initializeComponentLabels(index, new Map([['a', doc]]), new Set(), [
        { graphScreenId: 'a', path: 'html>body>html:form[1]', graphComponentId: 'form-1' },
        { graphScreenId: 'a', path: 'html>body>html:form[1]>input[1]', graphComponentId: 'q-1' },
      ]);
      return [...doc.querySelectorAll('[data-st-component-id]')].map(
        (node) => `${node.tagName.toLowerCase()}=${node.getAttribute('data-st-component-id')}`,
      );
    }, fixture().graph);
    assert.deepEqual(marked, ['html:form=form-1', 'input=q-1']);
  } finally {
    await browser.close();
  }
});

test('RV-609 a decision badge goes after controls and images, inside other elements', async () => {
  const source = await browserModule('review-ui', 'reviewUi');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<div id="d"></div><select id="s"><option>a</option></select><textarea id="t"></textarea><img id="i"><input id="n">',
    );
    await page.addScriptTag({ content: source });
    const placed = await page.evaluate(() =>
      ['d', 's', 't', 'i', 'n'].map((id) => {
        const node = document.getElementById(id),
          badge = document.createElement('span');
        window.reviewUi.placeBadge(node, badge);
        return badge.parentElement === node ? 'inside' : badge.previousElementSibling === node;
      }),
    );
    assert.deepEqual(placed, ['inside', true, true, true, true]);
  } finally {
    await browser.close();
  }
});
