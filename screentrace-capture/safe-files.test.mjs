import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertOutputPathWithin, MAX_ANALYSIS_GRAPH_BYTES, readAnalysisGraph, readUtf8Limited, resolveExistingFileWithin } from './safe-files.mjs';
import { createDirectoryWithin } from './safe-files.mjs';

test('bounded reads allow a project file and reject oversized inputs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'screentrace-safe-'));
  const file = path.join(root, 'source.jsp');
  await writeFile(file, '123456');
  assert.equal(await readUtf8Limited(root, file, 6), '123456');
  await assert.rejects(readUtf8Limited(root, file, 5), /byte limit/);
});

test('rejects traversal and symbolic-link source files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'screentrace-safe-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'screentrace-outside-'));
  const secret = path.join(outside, 'secret.jsp');
  await writeFile(secret, 'secret');
  await symlink(secret, path.join(root, 'link.jsp'));
  await assert.rejects(resolveExistingFileWithin(root, path.join(root, '..', path.basename(outside), 'secret.jsp')));
  await assert.rejects(resolveExistingFileWithin(root, path.join(root, 'link.jsp')));
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

test('refuses output symlinks and traversal', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'screentrace-output-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'screentrace-outside-'));
  await symlink(outside, path.join(root, 'linked'));
  await assert.rejects(assertOutputPathWithin(root, path.join(root, '..', 'escaped.txt')));
  await assert.rejects(assertOutputPathWithin(root, path.join(root, 'linked', 'escaped.txt')));
  await assert.rejects(createDirectoryWithin(root, path.join(root, 'linked', 'new-dir')));
});

test('accepts a configured output root through its root symlink while keeping child symlinks forbidden', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'screentrace-output-alias-'));
  const actual = path.join(parent, 'actual');
  const alias = path.join(parent, 'alias');
  await mkdir(actual);
  await symlink(actual, alias);
  const file = path.join(alias, 'report.html');
  assert.equal(await assertOutputPathWithin(alias, file), file);
  assert.equal(await createDirectoryWithin(alias, path.join(alias, 'nested')), await realpath(path.join(actual, 'nested')));
  await symlink(path.join(actual, 'nested'), path.join(actual, 'child-link'));
  await assert.rejects(assertOutputPathWithin(alias, path.join(alias, 'child-link', 'report.html')));
  await rm(parent, { recursive: true, force: true });
});

test('containment treats a sibling sharing the root name prefix as outside', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'screentrace-boundary-'));
  const root = path.join(parent, 'output');
  const sibling = path.join(parent, 'output-private');
  await mkdir(root);
  await mkdir(sibling);
  await writeFile(path.join(sibling, 'report.html'), 'private');
  await assert.rejects(resolveExistingFileWithin(root, path.join(sibling, 'report.html')));
  await assert.rejects(assertOutputPathWithin(root, path.join(sibling, 'report.html')));
  await rm(parent, { recursive: true, force: true });
});

test('JSP declared encoding decodes original bounded bytes',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'st-encoding-'));try{const file=path.join(root,'legacy.jsp');await writeFile(file,Buffer.from('PCVAIHBhZ2UgcGFnZUVuY29kaW5nPSJHQjE4MDMwIiU+PHRpdGxlPs7vwc88L3RpdGxlPg==','base64'));assert.match(await readUtf8Limited(root,file),/物料/);}finally{await rm(root,{recursive:true,force:true});}});

test('analysis graphs above the old 16 MiB cap load, and an over-budget graph fails clearly', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'screentrace-graph-'));
  try {
    // chrisekelley/zeprs produced a ~40 MB graph; the old 16 MiB read cap left all 198 screens without previews.
    const padding = 'x'.repeat(20 * 1024 * 1024);
    await writeFile(path.join(output, 'application-graph.json'), JSON.stringify({ schemaVersion: '2.2', nodes: [], relationships: [], diagnostics: [{ message: padding }] }));
    const graph = await readAnalysisGraph(output);
    assert.equal(graph.schemaVersion, '2.2');
    assert.ok(MAX_ANALYSIS_GRAPH_BYTES >= 256 * 1024 * 1024);
    await assert.rejects(readAnalysisGraph(output, 1024), /exceeds the 1024-byte preview budget/);
  } finally { await rm(output, { recursive: true, force: true }); }
});
