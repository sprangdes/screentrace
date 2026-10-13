import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile, rm, access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import {localReferences} from './react-preview.mjs';

const driver = path.resolve('screentrace-capture/capture-static-jsp.mjs');

async function fixture({installed}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'react-preview-')), output = path.join(root, 'analysis');
  await mkdir(path.join(root, 'web/src'), {recursive: true});
  await mkdir(path.join(output, 'static-preview'), {recursive: true});
  await writeFile(path.join(root, 'web/src/app.css'), '#save{width:200px;height:40px} @font-face{font-family:x;src:url("./fonts/x.woff2?v=1")}');
  await mkdir(path.join(root, 'web/src/fonts'));
  await writeFile(path.join(root, 'web/src/fonts/x.woff2'), 'font');
  if (installed) {
    await mkdir(path.join(root, 'web/node_modules/kit'), {recursive: true});
    await writeFile(path.join(root, 'web/node_modules/kit/kit.css'), 'body{margin:0}');
  }
  const source = {file: 'web/src/App.tsx', line: 3}, proof = [{source, parser: 'BabelReactAnalyzer', resolution: 'CONFIRMED'}];
  const anchor = 'web/src/App.tsx:3 > web/src/App.tsx:5';
  const graph = {schemaVersion: '2.2', application: {name: 'fixture', path: '.', technologies: ['React']},
    nodes: [
      {id: 'screen:a', type: 'SCREEN', name: 'home', attributes: {route: '/', view: 'Home', rendering: 'static-reconstruction'}, source, confidence: 'CONFIRMED', evidence: proof},
      {id: 'component:save', type: 'COMPONENT', name: 'Save', attributes: {kind: 'BUTTON', tag: 'button', expansionAnchor: anchor}, source: {file: 'web/src/App.tsx', line: 5}, confidence: 'CONFIRMED', evidence: proof}
    ],
    relationships: [{id: 'contains', type: 'CONTAINS', from: 'screen:a', to: 'component:save', confidence: 'CONFIRMED', source, evidence: proof}], behaviors: [], validationRules: []};
  await writeFile(path.join(output, 'application-graph.json'), JSON.stringify(graph));
  await writeFile(path.join(output, 'static-preview/react-preview.json'), JSON.stringify({
    stylesheets: [
      {specifier: 'kit/kit.css', from: 'web/src/main.tsx', line: 1, candidates: ['web/src/node_modules/kit/kit.css', 'web/node_modules/kit/kit.css']},
      {specifier: './app.css', from: 'web/src/main.tsx', line: 2, candidates: ['web/src/app.css']},
      {specifier: '../../escape.css', from: 'web/src/main.tsx', line: 3, candidates: ['../escape.css']}
    ],
    screens: {'screen:a': `<main data-st-source-file="web/src/App.tsx" data-st-source-line="4"><button id="save" data-st-expansion-anchor="${anchor.replace(/>/g, '&gt;')}" data-st-source-file="web/src/App.tsx" data-st-source-line="5">Save</button></main>`}
  }));
  return {root, output};
}

async function run(f) {
  const child = spawn(process.execPath, [driver, f.root, f.output, '--preview-v2']);
  let error = '';
  child.stderr.on('data', chunk => error += chunk);
  child.stdout.resume();
  return {status: await new Promise(resolve => child.on('close', resolve)), error};
}

test('React screens render their reconstructed markup with project stylesheets and map elements by anchor', async () => {
  const f = await fixture({installed: true});
  try {
    const result = await run(f);
    assert.equal(result.status, 0, result.error);
    const html = await readFile(path.join(f.output, 'static-preview/screen_a.html'), 'utf8');
    assert.match(html, /<link rel="stylesheet" href="assets\/react\/web\/node_modules\/kit\/kit.css"><link rel="stylesheet" href="assets\/react\/web\/src\/app.css">/);
    await access(path.join(f.output, 'static-preview/assets/react/web/src/fonts/x.woff2'));
    const styles = JSON.parse(await readFile(path.join(f.output, 'static-preview/element-styles.json'), 'utf8'));
    const save = styles.screens['screen:a'].elements.find(element => element.id === 'save');
    assert.equal(save.graphComponentId, 'component:save');
    assert.equal(save.matchBasis, 'ANCHOR');
    assert.equal(save.bounds.width, 200);
    const diagnostics = JSON.parse(await readFile(path.join(f.output, 'static-preview/diagnostics.json'), 'utf8'));
    assert.ok(diagnostics.some(message => message.includes('../../escape.css')), 'paths outside the project are refused');
  } finally { await rm(f.root, {recursive: true, force: true}); }
});

test('a package stylesheet that is not installed is reported, not fetched', async () => {
  const f = await fixture({installed: false});
  try {
    const result = await run(f);
    assert.equal(result.status, 0, result.error);
    const diagnostics = JSON.parse(await readFile(path.join(f.output, 'static-preview/diagnostics.json'), 'utf8'));
    assert.ok(diagnostics.some(message => message.includes('kit/kit.css') && message.includes('node_modules')));
  } finally { await rm(f.root, {recursive: true, force: true}); }
});

test('stylesheet references keep only relative local files', () => {
  assert.deepEqual(localReferences('a{background:url(img/a.png)} b{src:url("../f.woff?v=2#x")} c{background:url(data:image/png;base64,AA)} d{background:url(https://cdn/x.png)} e{background:url(/abs.png)}'),
    ['../f.woff', 'img/a.png']);
});
