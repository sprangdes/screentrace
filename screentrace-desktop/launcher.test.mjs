import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  analysisSummary,
  lastJsonLine,
  launcherCommand,
  markedPath,
  resolveLauncher,
  toolPath,
  readableLines,
  reportUrl,
  runLauncher,
  stopTree,
} from './launcher.mjs';

test('runs the bash launcher directly and the PowerShell one without a shell', () => {
  assert.deepEqual(launcherCommand('/st/bin/screentrace', ['analyze', '/a b'], 'darwin'), {
    file: '/st/bin/screentrace',
    args: ['analyze', '/a b'],
  });
  assert.deepEqual(launcherCommand('C:\\st\\bin\\screentrace.ps1', ['doctor'], 'win32'), {
    file: 'powershell.exe',
    args: [
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      'C:\\st\\bin\\screentrace.ps1',
      'doctor',
    ],
  });
});

test('reads the status JSON after build messages', () => {
  assert.deepEqual(lastJsonLine('Building updated ScreenTrace...\n{"format":1}\n'), { format: 1 });
  assert.throws(() => lastJsonLine('Building updated ScreenTrace...\n'), /沒有回傳狀態/);
});

const finished = [
  'Picked up JAVA_TOOL_OPTIONS: -Duser.home=/tmp/h',
  '11月 26, 2026 10:43:12 上午 io.screentrace.cli.ScreenTraceCli logAnalysis',
  '資訊: 分析完成：',
  '  專案：demo-shop',
  '  技術：JSP, Java, Spring MVC',
  '  Endpoints：2',
  '  Screens：3',
  '  Components：4',
  '  輸出：/out/demo-shop',
  '  提示：1 個網址可能缺少 context path，請使用 ./bin/screentrace config 設定後重新分析',
  'Nov 26, 2026 10:43:12 AM io.screentrace.cli.ScreenTraceCli printReportPath',
  'INFO: 單一 HTML 報表：file:///out/demo-shop/report/screentrace-report.html',
].join('\n');

test('drops the logger source lines and level prefixes', () => {
  assert.deepEqual(readableLines(finished).slice(0, 3), [
    'Picked up JAVA_TOOL_OPTIONS: -Duser.home=/tmp/h',
    '分析完成：',
    '  專案：demo-shop',
  ]);
});

test('reads the summary and report URL of a finished analysis', () => {
  assert.deepEqual(analysisSummary(finished), {
    project: 'demo-shop',
    technologies: ['JSP', 'Java', 'Spring MVC'],
    endpoints: '2',
    screens: '3',
    components: '4',
    output: '/out/demo-shop',
    notes: ['提示：1 個網址可能缺少 context path，請使用 ./bin/screentrace config 設定後重新分析'],
  });
  assert.equal(reportUrl(finished), 'file:///out/demo-shop/report/screentrace-report.html');
  assert.equal(analysisSummary('找不到專案資料夾：x'), null);
  assert.equal(reportUrl('找不到專案資料夾：x'), null);
});

test(
  'streams output, reports the exit code and stops the whole process tree',
  { skip: process.platform === 'win32' },
  async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'screentrace-desktop-'));
    try {
      const launcher = path.join(root, 'screentrace');
      writeFileSync(
        launcher,
        '#!/bin/sh\necho "args:$*"\necho oops >&2\n[ "$1" = wait ] && { sleep 30 & sleep 30; }\nexit 3\n',
      );
      chmodSync(launcher, 0o755);
      let streamed = '';
      const quick = await runLauncher(launcher, ['analyze', '/a b'], {
        onOutput: (text) => (streamed += text),
      }).done;
      assert.equal(quick.code, 3);
      assert.equal(quick.stdout, 'args:analyze /a b\n');
      assert.equal(quick.stderr, 'oops\n');
      assert.match(streamed, /args:analyze \/a b/);

      const slow = runLauncher(launcher, ['wait']);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const started = Date.now();
      stopTree(slow.child);
      const stopped = await slow.done;
      assert.notEqual(stopped.code, 0);
      assert.ok(Date.now() - started < 5000);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test('finds the launcher from the environment, then the installed app, then the checkout', () => {
  const installed = { launcher: '/repo/bin/screentrace' };
  assert.equal(
    resolveLauncher({
      env: { SCREENTRACE_LAUNCHER: '/dev/bin/screentrace' },
      installed,
      appDir: '/x',
    }),
    '/dev/bin/screentrace',
  );
  assert.equal(resolveLauncher({ env: {}, installed, appDir: '/x' }), '/repo/bin/screentrace');
  assert.equal(
    resolveLauncher({
      env: {},
      installed: null,
      appDir: '/st/screentrace-desktop',
      platform: 'darwin',
    }),
    path.join('/st/screentrace-desktop', '..', 'bin', 'screentrace'),
  );
});

test('an app opened from Finder gets the login shell PATH and Homebrew folders', () => {
  const merged = toolPath(
    '/usr/bin:/bin',
    '/Users/me/.nvm/bin:/opt/homebrew/bin:/usr/bin',
    'darwin',
  );
  const parts = merged.split(':');
  assert.deepEqual(parts.slice(0, 4), [
    '/Users/me/.nvm/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    '/bin',
  ]);
  assert.ok(parts.includes('/opt/homebrew/opt/openjdk@17/bin'));
  assert.equal(new Set(parts).size, parts.length);
  assert.equal(toolPath('/usr/bin', '/elsewhere', 'win32'), '/usr/bin');
  assert.equal(toolPath('/usr/bin:/bin', null, 'darwin').split(':')[0], '/usr/bin');
});

test('reads the PATH between the markers despite profile output', () => {
  assert.equal(markedPath('Welcome!\n__SCREENTRACE_PATH__/a:/b__SCREENTRACE_PATH__'), '/a:/b');
  assert.equal(markedPath('no markers'), null);
  assert.equal(markedPath(undefined), null);
});
