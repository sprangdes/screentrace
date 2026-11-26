// Runs ScreenTrace commands through bin/screentrace (or screentrace.ps1 on Windows) and reads
// their output. Plain Node, so it is tested without Electron (ADR 0190).
import { spawn } from 'node:child_process';
import path from 'node:path';

/** The program and arguments that run one launcher command; never through a shell. */
export function launcherCommand(launcher, args, platform = process.platform) {
  if (platform === 'win32')
    return {
      file: 'powershell.exe',
      args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcher, ...args],
    };
  return { file: launcher, args: [...args] };
}

/**
 * Starts one command. `onOutput(text)` receives standard output and error as they arrive; `done`
 * resolves with the exit code and both streams once the process ends.
 */
export function runLauncher(launcher, args, { onOutput, platform = process.platform, env } = {}) {
  const command = launcherCommand(launcher, args, platform);
  const child = spawn(command.file, command.args, {
    env: { ...process.env, ...env },
    // Its own process group on macOS / Linux, so cancelling also stops the Chromium capture.
    detached: platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (text) => {
    stdout += text;
    onOutput?.(text);
  });
  child.stderr.on('data', (text) => {
    stderr += text;
    onOutput?.(text);
  });
  const done = new Promise((resolve) => {
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: stderr + error.message }));
    child.on('close', (code, signal) =>
      resolve({ code: code ?? (signal ? -1 : 0), stdout, stderr }),
    );
  });
  return { child, done };
}

/** Stops a running command and everything it started. */
export function stopTree(child, platform = process.platform) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

/** The JSON a `desktop` command prints; the launcher may print build messages before it. */
export function lastJsonLine(stdout) {
  const lines = stdout.split(/\r?\n/).filter((line) => line.startsWith('{'));
  if (lines.length === 0) throw new Error('ScreenTrace 沒有回傳狀態');
  return JSON.parse(lines[lines.length - 1]);
}

// java.util.logging writes "<date> <class> <method>" above each message, then "INFO: " (or the
// localized level, e.g. "資訊: ") before it.
const LOG_SOURCE = /^.*\d.* io\.screentrace\.[\w.$]+ [\w$<>]+$/;
const LOG_LEVEL = /^(?:INFO|WARNING|SEVERE|資訊|警告|嚴重|信息|严重): /;

/** Output lines without the logger's source lines and level prefixes. */
export function readableLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !LOG_SOURCE.test(line))
    .map((line) => line.replace(LOG_LEVEL, ''));
}

const SUMMARY_KEYS = {
  專案: 'project',
  技術: 'technologies',
  Endpoints: 'endpoints',
  Screens: 'screens',
  Components: 'components',
  輸出: 'output',
};

/** The "分析完成：" block of a finished analysis, or null when the output has none. */
export function analysisSummary(text) {
  const lines = readableLines(text);
  const start = lines.findIndex((line) => line.trim() === '分析完成：');
  if (start < 0) return null;
  const summary = { notes: [] };
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('  ')) break;
    const match = /^\s+([^：]+)：(.*)$/.exec(line);
    const key = match && SUMMARY_KEYS[match[1]];
    if (key) summary[key] = match[2].trim();
    else summary.notes.push(line.trim());
  }
  if (summary.technologies !== undefined)
    summary.technologies = summary.technologies ? summary.technologies.split(', ') : [];
  return summary;
}

/** The report URL an analysis prints, or null. */
export function reportUrl(text) {
  const match = /單一 HTML 報表：(file:\S+)/.exec(text);
  return match ? match[1] : null;
}

/**
 * The launcher to run: SCREENTRACE_LAUNCHER (set by `bin/screentrace gui`), then the one an
 * installed app recorded in install.json, then the checkout around the app's own files.
 */
export function resolveLauncher({ env, installed, appDir, platform = process.platform }) {
  if (env.SCREENTRACE_LAUNCHER) return env.SCREENTRACE_LAUNCHER;
  if (installed?.launcher) return installed.launcher;
  return path.join(appDir, '..', 'bin', platform === 'win32' ? 'screentrace.ps1' : 'screentrace');
}

// Where Homebrew puts Java 17, Node 22 and Maven on Apple silicon and Intel Macs.
const MAC_TOOL_DIRS = [
  '/opt/homebrew/opt/openjdk@17/bin',
  '/opt/homebrew/opt/node@22/bin',
  '/opt/homebrew/bin',
  '/usr/local/opt/openjdk@17/bin',
  '/usr/local/opt/node@22/bin',
  '/usr/local/bin',
];

/**
 * The PATH for the launcher. An app opened from Finder or the Dock gets only the system folders,
 * so it adds the login shell's PATH (where the user installed Java, Maven and Node) and Homebrew's
 * folders, keeping the order and dropping duplicates.
 */
export function toolPath(current, loginShellPath, platform = process.platform) {
  if (platform !== 'darwin') return current;
  const parts = [
    ...(loginShellPath ?? '').split(':'),
    ...(current ?? '').split(':'),
    ...MAC_TOOL_DIRS,
  ];
  return [...new Set(parts.filter(Boolean))].join(':');
}

/** The PATH a login shell prints between two markers, ignoring anything its profile prints. */
export function markedPath(output) {
  const match = /__SCREENTRACE_PATH__(.*)__SCREENTRACE_PATH__/s.exec(output ?? '');
  return match ? match[1].trim() : null;
}
