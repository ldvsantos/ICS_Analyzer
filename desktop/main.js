const path = require('path');
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');

const docsPath = app.isPackaged
  ? path.join(process.resourcesPath, 'docs')
  : path.join(__dirname, '..', 'docs');

const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'app', 'build', 'icon.ico')
  : path.join(__dirname, 'build', 'icon.ico');

function docsFilePath(fileName) {
  return path.join(docsPath, fileName);
}

function navigateTo(mainWindow, fileName) {
  mainWindow.loadFile(docsFilePath(fileName));
}

function buildMenu(mainWindow) {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Abrir pasta de dados do app',
          click: async () => {
            await shell.openPath(app.getPath('userData'));
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' },
      ],
    },
    {
      label: 'Navegação',
      submenu: [
        {
          label: 'Sistema (Principal)',
          click: () => navigateTo(mainWindow, 'sistema.html'),
        },
        {
          label: 'Manual',
          click: () => navigateTo(mainWindow, 'manual.html'),
        },
        {
          label: 'Análise Conservacionista',
          click: () => navigateTo(mainWindow, 'long_term_analysis.html'),
        },
        { type: 'separator' },
        { role: 'reload', label: 'Recarregar' },
        { role: 'toggledevtools', label: 'Ferramentas do Desenvolvedor' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Abrir repositório no GitHub',
          click: async () => {
            await shell.openExternal('https://github.com/ldvsantos/ICS_Analyzer');
          },
        },
        {
          label: 'Sobre',
          click: async () => {
            await dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Sobre o ICS Analyzer',
              message: 'ICS Analyzer',
              detail: `Versão ${app.getVersion()}\n\nAplicativo desktop empacotado com Electron.`,
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: false,
    icon: appIconPath,
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

  buildMenu(mainWindow);
  navigateTo(mainWindow, 'sistema.html');
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
