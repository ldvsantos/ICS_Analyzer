const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('icsDesktop', {
  isDesktop: true,
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  setTitle: (title) => ipcRenderer.send('window:setTitle', String(title ?? '')),

  onMenuAction: (handler) => {
    if (typeof handler !== 'function') return () => {};
    const listener = (_event, action, payload) => handler(action, payload);
    ipcRenderer.on('menu:action', listener);
    return () => ipcRenderer.removeListener('menu:action', listener);
  },

  openProject: () => ipcRenderer.invoke('project:open'),
  openProjectPath: (filePath) => ipcRenderer.invoke('project:openPath', { filePath }),
  saveProject: ({ filePath, data }) => ipcRenderer.invoke('project:save', { filePath, data }),
  saveProjectAs: ({ data }) => ipcRenderer.invoke('project:saveAs', { data }),
  clearRecentProjects: () => ipcRenderer.invoke('project:clearRecents'),

  checkForUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
});
