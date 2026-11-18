import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('R90 the launchers find the Java version below "Picked up ..." lines', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'st-java-'));
  await writeFile(
    path.join(dir, 'java'),
    '#!/bin/sh\necho "Picked up JAVA_TOOL_OPTIONS: -Dx=1" >&2\necho \'openjdk version "21.0.13" 2026-10-24\' >&2\n',
  );
  await chmod(path.join(dir, 'java'), 0o755);
  const launcher = await readFile(new URL('../../bin/screentrace', import.meta.url), 'utf8');
  const fn = launcher.slice(
    launcher.indexOf('java_major_version() {'),
    launcher.indexOf('\n}\n', launcher.indexOf('java_major_version() {')) + 3,
  );
  const out = execFileSync('bash', ['-c', `${fn}\njava_major_version`], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
  });
  assert.equal(String(out).trim(), '21');
  // PowerShell reads every line and keeps the one with the version.
  const ps1 = await readFile(new URL('../../bin/screentrace.ps1', import.meta.url), 'utf8');
  assert.match(ps1, /Where-Object \{ \$_ -match 'version "' \}/);
});
