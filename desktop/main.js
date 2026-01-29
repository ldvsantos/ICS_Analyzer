const path = require('path');
const { app, BrowserWindow, shell } = require('electron');

const docsPath = app.isPackaged
  ? path.join(process.resourcesPath, 'docs')
  : path.join(__dirname, '..', 'docs');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    icon: path.join(docsPath, 'favicon.ico'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(docsPath, 'index.html'));
}

app.setAppUserModelId('br.ufs.icsanalyzer');

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
