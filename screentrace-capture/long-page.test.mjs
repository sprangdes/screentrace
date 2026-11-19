import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const capture = fileURLToPath(new URL('capture-static-jsp.mjs', import.meta.url));
const pngSize = (png) => [png.readUInt32BE(16), png.readUInt32BE(20)];

test('captures content below the viewport and scales the entire screenshot', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'screentrace-long-page-'));
  try {
    const project = path.join(root, 'project');
    const output = path.join(root, 'output');
    const id = 'screen:long-page';
    const view = 'src/main/webapp/long-page.jsp';
    await mkdir(path.dirname(path.join(project, view)), { recursive: true });
    await mkdir(output);
    await writeFile(
      path.join(project, view),
      '<!doctype html><html><body style="margin:0"><main style="height:1500px;background:#172554">Long page</main></body></html>',
    );
    await writeFile(
      path.join(output, 'application-graph.json'),
      JSON.stringify({
        schemaVersion: '2.2',
        application: { name: 'fixture', technologies: ['JSP'] },
        nodes: [{ id, type: 'SCREEN', name: 'Long page', attributes: { view } }],
        relationships: [],
      }),
    );

    await run(process.execPath, [capture, project, output, '--preview-v2'], { timeout: 30000 });
    const png = await readFile(path.join(output, 'screenshots/static-screen_long-page.png'));
    assert.deepEqual(pngSize(png), [1440, 1500]);
    const styles = JSON.parse(
      await readFile(path.join(output, 'static-preview/element-styles.json'), 'utf8'),
    );
    const thumbnail = Buffer.from(styles.screens[id].thumbnail.split(',')[1], 'base64');
    assert.deepEqual(pngSize(thumbnail), [640, 667]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
