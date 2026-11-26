import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = fileURLToPath(new URL('../../../', import.meta.url));

function cli(home, ...args) {
  return spawnSync(
    'java',
    [
      '-Duser.home=' + home,
      '-Djava.awt.headless=true',
      '-Dscreentrace.home=' + repo,
      '-jar',
      path.join(repo, 'screentrace-cli/target/screentrace-cli-0.1.0-SNAPSHOT.jar'),
      ...args,
    ],
    { encoding: 'utf8' },
  );
}

test('desktop commands report and change the workspace for the desktop app (ADR 0190)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'screentrace-desktop-cli-'));
  try {
    const home = path.join(root, 'home');
    const projects = path.join(root, 'projects');
    const output = path.join(root, 'out');
    mkdirSync(home);
    mkdirSync(path.join(projects, 'alpha'), { recursive: true });
    mkdirSync(path.join(projects, '.hidden'), { recursive: true });

    const empty = cli(home, 'desktop', 'status');
    assert.equal(empty.status, 0, empty.stderr);
    const before = JSON.parse(empty.stdout.trim());
    assert.equal(before.format, 1);
    assert.equal(before.projectRoot, null);
    assert.equal(before.browser, null);
    assert.ok(before.browsers.some((browser) => browser.id === 'system'));

    const saved = cli(home, 'desktop', 'workspace', projects, output);
    assert.equal(saved.status, 0, saved.stderr);
    const after = JSON.parse(saved.stdout.trim());
    assert.ok(after.projectRoot.endsWith(path.join('', 'projects')));
    assert.ok(after.outputRoot.endsWith(path.join('', 'out')));
    assert.deepEqual(
      after.projects.map((project) => [project.name, project.analyzed, project.outsideRoot]),
      [['alpha', false, false]],
    );
    const config = JSON.parse(readFileSync(path.join(home, '.screentrace', 'config.json'), 'utf8'));
    assert.equal(config.projectRoot, after.projectRoot);

    // A finished analysis is listed with its counts, even for a folder outside the project root.
    const analysis = path.join(after.outputRoot, 'beta');
    mkdirSync(path.join(analysis, 'report'), { recursive: true });
    writeFileSync(
      path.join(analysis, 'application-graph.json'),
      JSON.stringify({
        application: { path: path.join(root, 'gone'), technologies: ['JSP'] },
        nodes: [{ type: 'SCREEN' }, { type: 'SCREEN' }, { type: 'ENDPOINT' }],
      }),
    );
    for (const file of ['prototype-model.json', 'preview-model.json'])
      writeFileSync(path.join(analysis, file), '{}');
    writeFileSync(path.join(analysis, 'report', 'screentrace-report.html'), '<html></html>');
    const listed = JSON.parse(cli(home, 'desktop', 'status').stdout.trim());
    const beta = listed.projects.find((project) => project.name === 'beta');
    assert.equal(beta.analyzed, true);
    assert.equal(beta.outsideRoot, true);
    assert.equal(beta.source, null);
    assert.deepEqual(beta.summary, {
      technologies: ['JSP'],
      screens: 2,
      endpoints: 1,
      components: 0,
      personas: [],
      contextPathHints: 0,
    });

    const browser = cli(home, 'desktop', 'browser', 'system');
    assert.equal(browser.status, 0, browser.stderr);
    assert.equal(JSON.parse(browser.stdout.trim()).browser, 'system');

    const unknownBrowser = cli(home, 'desktop', 'browser', 'netscape');
    assert.equal(unknownBrowser.status, 2);
    assert.match(unknownBrowser.stderr, /找不到這個瀏覽器/);

    const missingRoot = cli(home, 'desktop', 'workspace', path.join(root, 'nope'), output);
    assert.equal(missingRoot.status, 2);
    assert.match(missingRoot.stderr, /目錄不存在/);

    const outside = cli(home, 'desktop', 'report', projects);
    assert.equal(outside.status, 2);
    assert.match(outside.stderr, /不在分析結果根目錄內/);

    const usage = cli(home, 'desktop', 'status', 'extra');
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /desktop status/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
