import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { packStandaloneDocuments } from './pack-preview.mjs';
// Decoded stylesheets of a pack: CSS lives in the asset dictionary, not inline in the documents.
const stylesheets = (packed) =>
  Object.values(packed.assets)
    .filter((v) => v.startsWith('data:text/css;base64,'))
    .map((v) => Buffer.from(v.split(',')[1], 'base64').toString('utf8'));
test('standalone pack embeds CSS imports, images, fonts by hash and removes active/external resources', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'st-pack-'));
  await mkdir(path.join(root, 'static-preview/assets'), { recursive: true });
  await writeFile(
    path.join(root, 'static-preview/assets/a.css'),
    '@import "b.css"; .a {background:url("x.png");font-family:a} @font-face{font-family:a;src:url("x.woff2")}',
  );
  await writeFile(
    path.join(root, 'static-preview/assets/b.css'),
    '.b{color:red;background:url(https://probe.invalid/css)}',
  );
  await writeFile(path.join(root, 'static-preview/assets/x.png'), Buffer.from([1, 2, 3]));
  await writeFile(path.join(root, 'static-preview/assets/x.woff2'), Buffer.from([4, 5, 6]));
  await writeFile(
    path.join(root, 'static-preview/a.html'),
    '<html><head><base href="https://probe.invalid"><link rel="stylesheet" href="assets/a.css"><meta http-equiv="refresh" content="0;url=https://probe.invalid"></head><body onload="probe()"><script>probe()</script><img src="assets/x.png"><img src="https://probe.invalid/img"><div style="background:u\\72l(https://probe.invalid/escaped)">A</div><a href="https://probe.invalid/">A</a></body></html>',
  );
  const packed = await packStandaloneDocuments(root, {
    a: 'static-preview/a.html',
    b: 'static-preview/a.html',
  });
  assert.equal(packed.documents.a, packed.documents.b);
  const css = stylesheets(packed);
  assert.equal(css.length, 2, 'a.css and its import b.css');
  assert.equal(Object.keys(packed.assets).length, 4, 'two stylesheets, the image and the font');
  assert.ok(css.some((v) => /color:red/.test(v)));
  assert.match(packed.documents.a, /st-asset-sha256:/);
  assert.doesNotMatch(packed.documents.a, /<style>/);
  assert.doesNotMatch(css.join('\n'), /https:\/\/probe/);
  assert.doesNotMatch(
    packed.documents.a,
    /<script|<base|http-equiv="refresh"|onload|https:\/\/probe/,
  );
  assert.ok(packed.diagnostics.some((d) => d.code === 'ASSET_UNRESOLVED'));
  assert.ok(Object.values(packed.assets).some((v) => v.startsWith('data:image/png;base64,')));
});
test('pack rejects symlinks and traversal while preserving diagnostic instead of loading outside files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'st-pack-'));
  await mkdir(path.join(root, 'static-preview'));
  await writeFile(path.join(root, 'static-preview/a.html'), '<img src="../../outside.png">');
  const result = await packStandaloneDocuments(root, { a: 'static-preview/a.html' });
  assert.doesNotMatch(result.documents.a, /outside\.png/);
  assert.ok(result.diagnostics.length);
  await assert.rejects(packStandaloneDocuments(root, { a: '../outside.html' }), /Path escapes/);
});
test('pack never reads symlinked resources', async () => {
  const { symlink } = await import('node:fs/promises');
  const root = await mkdtemp(path.join(tmpdir(), 'st-pack-link-'));
  await mkdir(path.join(root, 'static-preview'));
  const outside = await mkdtemp(path.join(tmpdir(), 'st-pack-outside-'));
  await writeFile(path.join(outside, 'secret.png'), 'PRIVATE');
  await symlink(path.join(outside, 'secret.png'), path.join(root, 'static-preview/link.png'));
  await writeFile(path.join(root, 'static-preview/a.html'), '<img src="link.png">');
  const packed = await packStandaloneDocuments(root, { a: 'static-preview/a.html' });
  assert.deepEqual(packed.assets, {});
  assert.ok(packed.diagnostics.length);
  assert.doesNotMatch(JSON.stringify(packed), /PRIVATE/);
});
