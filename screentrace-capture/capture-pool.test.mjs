import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { captureConcurrency, exclusive, outputChains, runChains } from './capture-pool.mjs';

const driver = path.resolve('screentrace-capture/capture-static-jsp.mjs');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('capture concurrency defaults to 4 and rejects values outside 1..32', () => {
  assert.equal(captureConcurrency([]), 4);
  assert.equal(captureConcurrency(['--capture-concurrency=1']), 1);
  assert.equal(captureConcurrency(['--capture-concurrency=32']), 32);
  for (const value of ['0', '33', '1.5', 'x', ''])
    assert.throws(
      () => captureConcurrency([`--capture-concurrency=${value}`]),
      /capture-concurrency/,
    );
});

test('items sharing an output file stay in one chain, in their original order', () => {
  const chains = outputChains(['a.b', 'c', 'a_b', 'd', 'c'], (id) => id.replace(/[^a-z]/g, '_'));
  assert.deepEqual(chains, [['a.b', 'a_b'], ['c', 'c'], ['d']]);
});

test('chains run at most N at once and each chain runs its items in order', async () => {
  const chains = [['a1', 'a2'], ['b1'], ['c1', 'c2'], ['d1']];
  let running = 0,
    peak = 0;
  const finished = [];
  await runChains(chains, 2, async (item) => {
    running++;
    peak = Math.max(peak, running);
    await delay(item === 'a1' ? 30 : 5);
    finished.push(item);
    running--;
  });
  assert.equal(peak, 2);
  assert.ok(finished.indexOf('a1') < finished.indexOf('a2'));
  assert.ok(finished.indexOf('c1') < finished.indexOf('c2'));
  assert.notDeepEqual(finished, chains.flat(), 'a slow first chain lets later chains finish first');
  assert.deepEqual([...finished].sort(), chains.flat().sort());
});

test('exclusive tasks run one at a time in call order, and a failure does not block the next', async () => {
  const run = exclusive(),
    log = [];
  const task = (name, ms, fail) => async () => {
    log.push(`start ${name}`);
    await delay(ms);
    log.push(`end ${name}`);
    if (fail) throw new Error(name);
  };
  const results = await Promise.allSettled([
    run(task('a', 20)),
    run(task('b', 1, true)),
    run(task('c', 1)),
  ]);
  assert.deepEqual(log, ['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  assert.deepEqual(
    results.map((r) => r.status),
    ['fulfilled', 'rejected', 'fulfilled'],
  );
});

async function project() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'capture-pool-')),
    output = path.join(root, 'analysis'),
    web = path.join(root, 'src/main/webapp');
  await mkdir(web, { recursive: true });
  await mkdir(output);
  // x.y and x_y share the preview file x_y.html; the later screen must win, as before R47.
  const ids = ['s0', 'x.y', 's1', 's2', 'x_y', 's3', 's4'];
  const nodes = [];
  for (const [index, id] of ids.entries()) {
    const file = `src/main/webapp/page${index}.jsp`,
      source = { file, line: 1 };
    const rows = Array.from({ length: index * 3 + 1 }, (_, r) => `<li>row ${r}</li>`).join('');
    await writeFile(
      path.join(root, file),
      `<html><body><h1 style="color:rgb(${index * 30}, 0, 0)">Screen ${id}</h1><ul>${rows}</ul>` +
        `<form action="/next${index}"><button>Go ${index}</button></form></body></html>`,
    );
    nodes.push({
      id,
      type: 'SCREEN',
      name: id,
      attributes: { view: file },
      source,
      confidence: 'CONFIRMED',
      evidence: [{ source, parser: 'FixtureParser', resolution: 'CONFIRMED' }],
    });
  }
  await writeFile(
    path.join(output, 'application-graph.json'),
    JSON.stringify({
      schemaVersion: '2.2',
      application: { name: 'fixture', path: '.', technologies: ['JSP'] },
      nodes,
      relationships: [],
    }),
  );
  return { root, output, ids };
}

function capture(root, output, ...args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [driver, root, output, '--preview-v2', ...args]);
    let stderr = '';
    child.stderr.on('data', (data) => (stderr += data));
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

async function files(directory, prefix = '') {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(prefix, entry.name);
    if (entry.isDirectory())
      Object.assign(result, await files(path.join(directory, entry.name), name));
    else result[name] = await readFile(path.join(directory, entry.name));
  }
  return result;
}

test('an invalid capture concurrency stops the capture', async () => {
  const f = await project();
  try {
    const { code, stderr } = await capture(f.root, f.output, '--capture-concurrency=0');
    assert.notEqual(code, 0);
    assert.match(stderr, /capture-concurrency/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('capturing on several pages writes the same files as one page, merged in screen order', async () => {
  const f = await project();
  try {
    const outputs = {};
    for (const n of [1, 4]) {
      const output = path.join(f.root, `analysis-${n}`);
      await mkdir(output);
      await writeFile(
        path.join(output, 'application-graph.json'),
        await readFile(path.join(f.output, 'application-graph.json')),
      );
      const { code, stderr } = await capture(f.root, output, `--capture-concurrency=${n}`);
      assert.equal(code, 0, stderr);
      outputs[n] = output;
    }
    const one = await files(outputs[1]),
      four = await files(outputs[4]);
    assert.deepEqual(Object.keys(four).sort(), Object.keys(one).sort());
    for (const name of Object.keys(one)) assert.ok(one[name].equals(four[name]), name);
    const manifest = JSON.parse(one[path.join('static-preview', 'manifest.json')]);
    assert.deepEqual(Object.keys(manifest), f.ids);
    const styles = JSON.parse(one[path.join('static-preview', 'element-styles.json')]);
    assert.deepEqual(Object.keys(styles.screens), f.ids);
    assert.match(String(one[path.join('static-preview', 'x_y.html')]), /Screen x_y/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
