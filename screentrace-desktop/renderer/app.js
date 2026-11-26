// The analysis workbench page. It only talks to the app through window.screentrace (preload.cjs).
'use strict';

const api = window.screentrace;
const $ = (id) => document.getElementById(id);

const state = {
  status: null,
  selected: null, // project name
  extra: new Map(), // folders picked outside the project root, by name
  runs: new Map(), // name -> { state, log, started, ended, summary, message }
  running: null,
  query: '',
};
const LOG_LIMIT = 200_000;

// java.util.logging prints "<date> <class> <method>" above each message and a level prefix.
const LOG_SOURCE = /^.*\d.* io\.screentrace\.[\w.$]+ [\w$<>]+$/;
const LOG_LEVEL = /^(?:INFO|WARNING|SEVERE|資訊|警告|嚴重|信息|严重): /;

function message(error) {
  const text = String(error?.message ?? error);
  return text.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}

function toast(text, error = false) {
  const element = $('toast');
  element.textContent = text;
  element.className = 'toast' + (error ? ' error' : '');
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (element.hidden = true), error ? 7000 : 3500);
}

function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(seconds / 60);
  return m ? `${m} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
}

function basename(folder) {
  return folder.split(/[\\/]/).filter(Boolean).pop() || folder;
}

function joinPath(root, name) {
  const separator = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  return root.replace(/[\\/]+$/, '') + separator + name;
}

/** Every project the list shows: the root's folders, earlier analyses and picked folders. */
function projects() {
  const list = [...(state.status?.projects ?? [])];
  for (const extra of state.extra.values())
    if (!list.some((project) => project.name === extra.name)) list.push(extra);
  return list;
}

function selectedProject() {
  return projects().find((project) => project.name === state.selected) ?? null;
}

async function refresh() {
  try {
    state.status = await api.status();
  } catch (error) {
    toast('無法讀取 ScreenTrace 狀態：' + message(error), true);
    return;
  }
  for (const name of [...state.extra.keys()])
    if (state.status.projects.some((project) => project.name === name)) state.extra.delete(name);
  if (!selectedProject()) state.selected = projects()[0]?.name ?? null;
  render();
}

function render() {
  renderList();
  renderDetail();
}

function stateMark(project) {
  const run = state.runs.get(project.name);
  if (run?.state === 'running') return { className: 'state running', text: '', spinner: true };
  if (run?.state === 'failed') return { className: 'state failed', text: '!' };
  if (project.analyzed) return { className: 'state done', text: '✓' };
  return { className: 'state', text: '' };
}

function projectRow(project) {
  const item = document.createElement('li');
  item.setAttribute('role', 'option');
  item.setAttribute('aria-selected', String(project.name === state.selected));
  item.dataset.name = project.name;
  const mark = stateMark(project);
  const badge = document.createElement('span');
  badge.className = mark.spinner ? 'spinner' : mark.className;
  badge.textContent = mark.text;
  const text = document.createElement('div');
  text.className = 'text';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = project.name;
  const sub = document.createElement('div');
  sub.className = 'sub';
  const run = state.runs.get(project.name);
  sub.textContent =
    run?.state === 'running'
      ? '分析中…'
      : run?.state === 'failed'
        ? '分析失敗'
        : project.analyzed
          ? '已分析 · ' + formatTime(project.analyzedAt)
          : '尚未分析';
  text.append(title, sub);
  item.append(badge, text);
  item.addEventListener('click', () => {
    state.selected = project.name;
    render();
  });
  return item;
}

function section(text) {
  const item = document.createElement('li');
  item.className = 'section';
  item.textContent = text;
  return item;
}

function renderList() {
  const status = state.status;
  const list = $('projects');
  list.replaceChildren();
  const query = state.query.trim().toLowerCase();
  const visible = projects().filter((project) => project.name.toLowerCase().includes(query));
  const inRoot = visible.filter((project) => !project.outsideRoot);
  const outside = visible.filter((project) => project.outsideRoot);
  for (const project of inRoot) list.append(projectRow(project));
  if (outside.length) {
    list.append(section(status?.projectRoot ? '根目錄以外' : '已分析的資料夾'));
    for (const project of outside) list.append(projectRow(project));
  }
  if (visible.length === 0 && status) {
    const none = document.createElement('li');
    none.className = 'none';
    none.textContent = query ? '沒有符合的專案' : '沒有專案';
    list.append(none);
  }
}

function renderDetail() {
  const project = selectedProject();
  $('empty').hidden = Boolean(project);
  $('detail').hidden = !project;
  if (!project) {
    $('empty-text').textContent = state.status?.projectRoot
      ? '專案根目錄下沒有資料夾。可以選擇其他資料夾分析，或在設定中更換專案根目錄。'
      : '設定專案根目錄後，根目錄下的每個資料夾都會列在左側；也可以直接選擇一個資料夾分析。';
    return;
  }
  const run = state.runs.get(project.name);
  const running = run?.state === 'running';
  $('project-name').textContent = project.name;
  $('project-source').textContent = project.source ?? '找不到原始碼資料夾';
  $('project-output').textContent = project.analysis;

  const status = $('project-status');
  if (running) {
    status.className = 'status running';
    status.textContent = '分析中';
  } else if (run?.state === 'failed') {
    status.className = 'status failed';
    status.textContent = '分析失敗';
  } else if (project.analyzed) {
    status.className = 'status done';
    status.textContent = '已分析 · ' + formatTime(project.analyzedAt);
  } else {
    status.className = 'status';
    status.textContent = '尚未分析';
  }

  $('analyze').textContent = project.analyzed ? '重新分析' : '分析專案';
  $('analyze').disabled = Boolean(state.running) || !project.source;
  $('analyze').title = !project.source
    ? '找不到原始碼資料夾，無法重新分析'
    : state.running && !running
      ? `「${state.running}」分析中，完成後才能分析其他專案`
      : '';
  $('open-report').disabled = running || !project.analyzed;
  $('open-output').disabled = !project.analyzed;
  $('open-source').disabled = !project.source;

  renderSummary(project, run);
  renderRun(project, run);
}

/** The last analysis on disk, read by `desktop status`. */
function renderSummary(project, run) {
  const summary = project.analyzed ? project.summary : null;
  $('summary-card').hidden = !summary;
  $('pending-card').hidden = Boolean(summary) || running(run);
  $('pending-output').textContent = '結果會寫入 ' + project.analysis;
  if (!summary) return;
  $('summary-meta').textContent = formatTime(project.analyzedAt);
  $('stat-screens').textContent = summary.screens;
  $('stat-endpoints').textContent = summary.endpoints;
  $('stat-components').textContent = summary.components;
  $('technology-section').hidden = summary.technologies.length === 0;
  $('stat-technologies').replaceChildren(
    ...summary.technologies.map((name) => element('span', '', name)),
  );
  const personas = summary.personas ?? [];
  $('persona-section').hidden = personas.length === 0;
  $('stat-personas').replaceChildren(...personas.map(personaRow));
  const hints = summary.contextPathHints ?? 0;
  $('stat-hint').hidden = hints === 0;
  $('stat-hint').textContent =
    `${hints} 個網址可能缺少 context path。請在設定檔的 contextPaths 補上後重新分析，報表中的網址才會正確。`;
  $('project-output').textContent = project.analysis;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** One role: name, a reachable / possible / unreached bar and the three counts. */
function personaRow(persona) {
  const total = persona.reachable + persona.possible + persona.unreached;
  const bar = element('div', 'bar');
  for (const [key, count] of [
    ['reachable', persona.reachable],
    ['possible', persona.possible],
    ['unreached', persona.unreached],
  ])
    if (count > 0) {
      const part = element('span', key);
      part.style.flexGrow = String(count);
      bar.append(part);
    }
  const counts = element('div', 'counts');
  counts.append(
    element('span', 'reachable', `可達 ${persona.reachable}`),
    element('span', 'possible', `可能 ${persona.possible}`),
    element('span', 'unreached', `未到達 ${persona.unreached}`),
  );
  const row = element('li');
  row.append(element('div', 'persona-name', persona.name), bar, counts);
  row.title = `共 ${total} 個畫面`;
  return row;
}

function running(run) {
  return run?.state === 'running';
}

/** The analysis in progress, or how the last one in this window ended. */
function renderRun(project, run) {
  $('run-card').hidden = !run;
  if (!run) return;
  const active = running(run);
  $('run-card').className = 'card run ' + run.state;
  $('run-icon').className = 'run-icon ' + (active ? 'spinner' : run.state);
  $('run-icon').textContent = active ? '' : run.state === 'done' ? '✓' : '!';
  $('cancel').hidden = !active;
  $('run-title').textContent = active
    ? `正在分析 ${project.name}`
    : run.state === 'done'
      ? '分析完成'
      : run.state === 'cancelled'
        ? '已停止分析'
        : '分析失敗';
  $('run-sub').textContent = active ? currentStep(run) : (run.message ?? '');
  updateRunTime();
  const log = $('log');
  if (log.dataset.name !== project.name || log.textContent.length !== run.log.length) {
    const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
    log.textContent = run.log || '（尚無輸出）';
    log.dataset.name = project.name;
    if (atBottom || active) log.scrollTop = log.scrollHeight;
  }
  // A failure opens the record so its cause is visible; otherwise it stays folded.
  if (run.state === 'failed' && !run.shownLog) {
    $('log-details').open = true;
    run.shownLog = true;
  }
}

/** The latest line the analysis printed, as a hint of what it is doing. */
function currentStep(run) {
  const lines = run.log
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('Picked up '));
  return lines.length ? lines[lines.length - 1] : '準備分析環境…';
}

function updateRunTime() {
  const run = state.runs.get(state.selected);
  if (!run) return;
  const elapsed = formatDuration((run.ended ?? Date.now()) - run.started);
  $('run-time').textContent = run.ended ? '耗時 ' + elapsed : elapsed;
}

function appendOutput(text) {
  const run = state.runs.get(state.running);
  if (!run) return;
  // Output arrives in chunks; only whole lines are filtered and shown.
  const lines = (run.pending + text).split(/\r?\n/);
  run.pending = lines.pop();
  for (const line of lines)
    if (!LOG_SOURCE.test(line)) run.log += line.replace(LOG_LEVEL, '') + '\n';
  if (run.log.length > LOG_LIMIT) run.log = '…\n' + run.log.slice(-LOG_LIMIT);
  if (state.selected === state.running) renderDetail();
}

async function analyze(project) {
  if (state.running || !project.source) return;
  const run = {
    state: 'running',
    log: '',
    pending: '',
    started: Date.now(),
    summary: null,
    message: null,
  };
  state.runs.set(project.name, run);
  state.running = project.name;
  render();
  const timer = setInterval(updateRunTime, 1000);
  try {
    const result = await api.analyze(project.source);
    run.summary = result.summary;
    if (result.cancelled) {
      run.state = 'cancelled';
      run.message = '分析已停止；既有的分析結果可能不完整，請重新分析。';
    } else if (result.code === 0) {
      run.state = 'done';
      run.message = '結果已更新，可以開啟報表。';
    } else {
      run.state = 'failed';
      run.message = result.message;
    }
  } catch (error) {
    run.state = 'failed';
    run.message = message(error);
  } finally {
    clearInterval(timer);
    if (run.pending) run.log += run.pending.replace(LOG_LEVEL, '') + '\n';
    run.pending = '';
    run.ended = Date.now();
    state.running = null;
  }
  await refresh();
  if (run.state === 'done') toast(`「${project.name}」分析完成`);
}

async function openReport(project) {
  try {
    toast('正在開啟報表…');
    await api.openReport(project.analysis);
  } catch (error) {
    toast('無法開啟報表：' + message(error), true);
  }
}

async function openFolder(folder) {
  try {
    await api.openFolder(folder);
  } catch (error) {
    toast('無法開啟資料夾：' + message(error), true);
  }
}

async function pickOtherFolder() {
  const folder = await api.pickFolder(
    '選擇要分析的專案資料夾',
    state.status?.projectRoot ?? undefined,
  );
  if (!folder) return;
  const name = basename(folder);
  const existing = projects().find((project) => project.name === name);
  if (existing && existing.source && existing.source !== folder) {
    toast(
      `已有名為「${name}」的專案（${existing.source}）；分析結果資料夾同名，請先將其中一個資料夾改名。`,
      true,
    );
    return;
  }
  if (!existing)
    state.extra.set(name, {
      name,
      source: folder,
      analysis: joinPath(state.status.outputRoot, name),
      outsideRoot: true,
      analyzed: false,
      analyzedAt: null,
      report: null,
    });
  state.selected = name;
  render();
  const project = selectedProject();
  if (project && !state.running) analyze(project);
}

// Settings
const draft = { projectRoot: null, outputRoot: null };

function openSettings() {
  const status = state.status;
  draft.projectRoot = status?.projectRoot ?? null;
  draft.outputRoot = status?.outputRoot ?? null;
  $('setting-root').value = draft.projectRoot ?? '';
  $('setting-output').value = draft.outputRoot ?? '';
  const select = $('setting-browser');
  select.replaceChildren();
  const automatic = new Option('自動（Chrome → Edge → 系統預設）', '');
  select.append(automatic);
  for (const browser of status?.browsers ?? [])
    select.append(new Option(browser.label, browser.id));
  select.value = status?.browser ?? '';
  automatic.disabled = Boolean(status?.browser);
  $('settings-error').hidden = true;
  $('settings').showModal();
}

async function pickSetting(key, input, title) {
  const folder = await api.pickFolder(title, draft[key] ?? undefined);
  if (!folder) return;
  draft[key] = folder;
  $(input).value = folder;
  // A new project root suggests its own analyze folder, like the terminal setting does.
  if (key === 'projectRoot' && !state.status?.projectRoot) {
    draft.outputRoot = joinPath(folder, 'analyze');
    $('setting-output').value = draft.outputRoot;
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const status = state.status;
  const error = $('settings-error');
  error.hidden = true;
  $('settings-save').disabled = true;
  try {
    const rootChanged =
      draft.projectRoot &&
      (draft.projectRoot !== status?.projectRoot || draft.outputRoot !== status?.outputRoot);
    if (rootChanged) await api.saveWorkspace(draft.projectRoot, draft.outputRoot);
    const browser = $('setting-browser').value;
    if (browser && browser !== status?.browser) await api.saveBrowser(browser);
    $('settings').close();
    state.extra.clear();
    await refresh();
    toast('設定已儲存');
  } catch (failure) {
    error.textContent = message(failure);
    error.hidden = false;
  } finally {
    $('settings-save').disabled = false;
  }
}

// Environment check
async function checkEnvironment(show = false) {
  $('doctor-dot').className = 'dot';
  $('doctor-label').textContent = '檢查環境中…';
  try {
    const result = await api.doctor();
    $('doctor-dot').className = 'dot ' + (result.ready ? 'ok' : 'bad');
    $('doctor-label').textContent = result.ready ? '環境就緒' : '環境缺少項目';
    $('doctor-output').textContent = result.output;
    $('doctor-hint').hidden = result.ready;
    if (show || !result.ready) $('doctor').showModal();
  } catch (error) {
    $('doctor-dot').className = 'dot bad';
    $('doctor-label').textContent = '無法檢查環境';
    $('doctor-output').textContent = message(error);
    $('doctor-hint').hidden = false;
  }
}

function bind() {
  $('search').addEventListener('input', (event) => {
    state.query = event.target.value;
    renderList();
  });
  $('analyze').addEventListener('click', () => {
    const project = selectedProject();
    if (project) analyze(project);
  });
  $('cancel').addEventListener('click', () => api.cancelAnalysis());
  $('open-report').addEventListener('click', () => {
    const project = selectedProject();
    if (project) openReport(project);
  });
  $('open-output').addEventListener('click', () => {
    const project = selectedProject();
    if (project) openFolder(project.analysis);
  });
  $('open-source').addEventListener('click', () => {
    const project = selectedProject();
    if (project?.source) openFolder(project.source);
  });
  $('other-folder').addEventListener('click', pickOtherFolder);
  $('empty-other').addEventListener('click', pickOtherFolder);
  $('settings-button').addEventListener('click', openSettings);
  $('empty-settings').addEventListener('click', openSettings);
  $('pick-root').addEventListener('click', () =>
    pickSetting('projectRoot', 'setting-root', '選擇專案根目錄'),
  );
  $('pick-output').addEventListener('click', () =>
    pickSetting('outputRoot', 'setting-output', '選擇分析結果根目錄'),
  );
  $('settings-form').addEventListener('submit', saveSettings);
  $('settings-cancel').addEventListener('click', () => $('settings').close());
  $('doctor-chip').addEventListener('click', () => $('doctor').showModal());
  $('doctor-close').addEventListener('click', () => $('doctor').close());
  $('doctor-rerun').addEventListener('click', () => checkEnvironment(true));
  api.onAnalysisOutput(appendOutput);
}

bind();
refresh();
checkEnvironment();
