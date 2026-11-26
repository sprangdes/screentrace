// The only bridge between the page and the app: one function per launcher action (ADR 0190).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screentrace', {
  status: () => ipcRenderer.invoke('status'),
  saveWorkspace: (projectRoot, outputRoot) =>
    ipcRenderer.invoke('save-workspace', projectRoot, outputRoot),
  saveBrowser: (id) => ipcRenderer.invoke('save-browser', id),
  openReport: (analysisFolder) => ipcRenderer.invoke('open-report', analysisFolder),
  openFolder: (folder) => ipcRenderer.invoke('open-folder', folder),
  pickFolder: (title, defaultPath) => ipcRenderer.invoke('pick-folder', title, defaultPath),
  doctor: () => ipcRenderer.invoke('doctor'),
  analyze: (source) => ipcRenderer.invoke('analyze', source),
  cancelAnalysis: () => ipcRenderer.invoke('cancel-analysis'),
  onAnalysisOutput: (listener) => {
    const forward = (_event, text) => listener(text);
    ipcRenderer.on('analysis-output', forward);
    return () => ipcRenderer.removeListener('analysis-output', forward);
  },
});
