// ScreenTrace desktop app: a window over the same commands as the terminal menu (ADR 0190).
// Every action runs the launcher; the app keeps no analysis logic of its own.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analysisSummary,
  lastJsonLine,
  markedPath,
  reportUrl,
  resolveLauncher,
  runLauncher,
  stopTree,
  toolPath,
} from './launcher.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function installedConfig() {
  try {
    return JSON.parse(readFileSync(path.join(here, 'install.json'), 'utf8'));
  } catch {
    return null; // Not an installed app: run from the checkout.
  }
}

/** The login shell's PATH; Finder and the Dock start apps without it. */
function loginShellPath() {
  if (process.platform !== 'darwin') return null;
  const result = spawnSync(
    process.env.SHELL || '/bin/zsh',
    ['-ilc', 'printf "__SCREENTRACE_PATH__%s__SCREENTRACE_PATH__" "$PATH"'],
    { encoding: 'utf8', timeout: 5000 },
  );
  return markedPath(result.stdout);
}

if (app.isPackaged) process.env.PATH = toolPath(process.env.PATH, loginShellPath());
const launcher = resolveLauncher({ env: process.env, installed: installedConfig(), appDir: here });
const page = path.join(here, 'renderer', 'index.html');

let window = null;
let analysis = null;

function createWindow() {
  window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    title: 'ScreenTrace',
    backgroundColor: '#f4f5f7',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  window.removeMenu();
  // The window shows only the app's own page; links and new windows never open inside it.
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('close', (event) => {
    if (!analysis) return;
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      buttons: ['停止分析並關閉', '取消'],
      defaultId: 1,
      cancelId: 1,
      message: '分析仍在進行中',
      detail: '關閉視窗會停止目前的分析。',
    });
    if (choice === 1) event.preventDefault();
    else stopTree(analysis.child);
  });
  window.on('closed', () => (window = null));
  window.loadFile(page);
}

/** Accepts IPC only from the app's own page. */
function handle(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    const url = event.senderFrame?.url ?? '';
    if (!url.startsWith('file:') || fileURLToPath(url) !== page)
      throw new Error('拒絕來源不明的要求');
    return listener(...args);
  });
}

function text(value, name) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096)
    throw new Error(name + '無效');
  return value;
}

function directory(value, name) {
  const folder = text(value, name);
  if (!path.isAbsolute(folder)) throw new Error(name + '必須是完整路徑');
  return folder;
}

function existingDirectory(value, name) {
  const folder = directory(value, name);
  if (!existsSync(folder) || !statSync(folder).isDirectory())
    throw new Error('找不到資料夾：' + folder);
  return folder;
}

/** Runs one `desktop` command and returns its JSON, or throws its message. */
async function desktop(...args) {
  const result = await runLauncher(launcher, ['desktop', ...args]).done;
  if (result.code !== 0) throw new Error(failure(result));
  return args[0] === 'report' ? null : lastJsonLine(result.stdout);
}

function failure(result) {
  const lines = (result.stderr || result.stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] || 'ScreenTrace 指令失敗（結束碼 ' + result.code + '）';
}

handle('status', () => desktop('status'));
handle('save-workspace', (projectRoot, outputRoot) =>
  desktop(
    'workspace',
    existingDirectory(projectRoot, '專案根目錄'),
    directory(outputRoot, '分析結果根目錄'),
  ),
);
handle('save-browser', (id) => desktop('browser', text(id, '瀏覽器')));
handle('open-report', (folder) => desktop('report', existingDirectory(folder, '分析結果')));
handle('open-folder', async (folder) => {
  const problem = await shell.openPath(existingDirectory(folder, '資料夾'));
  if (problem) throw new Error(problem);
});
handle('pick-folder', async (title, defaultPath) => {
  const result = await dialog.showOpenDialog(window, {
    title: text(title, '標題'),
    defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});
handle('doctor', async () => {
  const result = await runLauncher(launcher, ['doctor']).done;
  return { ready: result.code === 0, output: (result.stdout + result.stderr).trim() };
});
handle('analyze', async (source) => {
  if (analysis) throw new Error('已有分析在進行中');
  const folder = existingDirectory(source, '專案資料夾');
  const send = (channel, value) => window?.webContents.send(channel, value);
  const run = runLauncher(launcher, ['analyze', folder], {
    onOutput: (output) => send('analysis-output', output),
  });
  analysis = { child: run.child, cancelled: false };
  const current = analysis;
  const result = await run.done;
  analysis = null;
  const output = result.stdout + '\n' + result.stderr;
  return {
    code: result.code,
    cancelled: current.cancelled,
    summary: analysisSummary(output),
    report: reportUrl(output),
    message: result.code === 0 ? null : failure(result),
  };
});
handle('cancel-analysis', () => {
  if (!analysis) return false;
  analysis.cancelled = true;
  stopTree(analysis.child);
  return true;
});

app.setName('ScreenTrace');
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => app.quit());
