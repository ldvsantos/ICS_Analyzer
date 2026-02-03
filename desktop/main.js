const path = require('path');
const fs = require('fs');
const https = require('https');
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');

const docsPath = app.isPackaged
  ? path.join(process.resourcesPath, 'docs')
  : path.join(__dirname, '..', 'docs');

const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.ico')
  : path.join(__dirname, 'build', 'icon.ico');

function docsFilePath(fileName) {
  return path.join(docsPath, fileName);
}

function navigateTo(mainWindow, fileName) {
  mainWindow.loadFile(docsFilePath(fileName));
}

function getRecentProjectsFilePath() {
  return path.join(app.getPath('userData'), 'recent-projects.json');
}

function readRecentProjects() {
  try {
    const raw = fs.readFileSync(getRecentProjectsFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => typeof p === 'string' && p.trim() !== '');
  } catch {
    return [];
  }
}

function writeRecentProjects(paths) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(getRecentProjectsFilePath(), JSON.stringify(paths, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

function addRecentProject(filePath) {
  const clean = String(filePath ?? '').trim();
  if (!clean) return;

  const existing = readRecentProjects();
  const next = [clean, ...existing.filter((p) => p !== clean)].slice(0, 12);
  writeRecentProjects(next);
}

function compareVersions(a, b) {
  const norm = (v) => String(v ?? '')
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((x) => parseInt(x, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
  const av = norm(a);
  const bv = norm(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    const ai = av[i] ?? 0;
    const bi = bv[i] ?? 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      headers: {
        'User-Agent': 'ICS-Analyzer-Desktop',
        'Accept': 'application/vnd.github+json',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function buildMenu(mainWindow) {
  const recent = readRecentProjects().filter((p) => fs.existsSync(p));

  const template = [
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Novo projeto',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu:action', 'project:new'),
        },
        {
          label: 'Abrir…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('menu:action', 'project:open'),
        },
        {
          type: 'separator',
        },
        {
          label: 'Salvar',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu:action', 'project:save'),
        },
        {
          label: 'Salvar como…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('menu:action', 'project:saveAs'),
        },
        {
          type: 'separator',
        },
        {
          label: 'Projetos recentes',
          submenu: [
            ...(recent.length
              ? recent.map((p) => ({
                label: p,
                click: () => mainWindow.webContents.send('menu:action', 'project:openRecent', { filePath: p }),
              }))
              : [{ label: '(vazio)', enabled: false }]),
            { type: 'separator' },
            {
              label: 'Limpar lista',
              click: async () => {
                writeRecentProjects([]);
                buildMenu(mainWindow);
              },
            },
          ],
        },
        {
          type: 'separator',
        },
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
        {
          label: 'Exportar PDF',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow.webContents.send('menu:action', 'project:exportPdf'),
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
          label: 'Verificar atualizações',
          click: () => mainWindow.webContents.send('menu:action', 'app:checkUpdates'),
        },
        { type: 'separator' },
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
              detail: `Versão ${app.getVersion()}\n\nDesktop (Electron) com interface local (HTML/JS).\nDados do app em: ${app.getPath('userData')}`,
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
    title: 'ICS Analyzer',
    backgroundColor: '#f6f7f9',
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
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

  return mainWindow;
}

app.setAppUserModelId('br.ufs.icsanalyzer');

function setupIpc(mainWindow) {
  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.on('window:setTitle', (event, title) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setTitle(String(title ?? 'ICS Analyzer'));
  });

  ipcMain.handle('project:clearRecents', () => {
    writeRecentProjects([]);
    buildMenu(mainWindow);
    return true;
  });

  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Abrir projeto (ICS Analyzer)',
      properties: ['openFile'],
      filters: [
        { name: 'Projeto ICS Analyzer', extensions: ['icsproj', 'json'] },
        { name: 'Todos os arquivos', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths?.length) return { canceled: true };

    const filePath = result.filePaths[0];
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      addRecentProject(filePath);
      buildMenu(mainWindow);
      return { canceled: false, filePath, data };
    } catch (err) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Falha ao abrir projeto',
        message: 'Não foi possível abrir o arquivo de projeto.',
        detail: String(err?.message || err),
      });
      return { canceled: true };
    }
  });

  ipcMain.handle('project:openPath', async (_event, { filePath }) => {
    const clean = String(filePath ?? '').trim();
    if (!clean) return { canceled: true };
    try {
      const raw = fs.readFileSync(clean, 'utf8');
      const data = JSON.parse(raw);
      addRecentProject(clean);
      buildMenu(mainWindow);
      return { canceled: false, filePath: clean, data };
    } catch (err) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Falha ao abrir projeto',
        message: 'Não foi possível abrir o arquivo de projeto.',
        detail: String(err?.message || err),
      });
      return { canceled: true };
    }
  });

  ipcMain.handle('project:save', async (_event, { filePath, data }) => {
    const clean = String(filePath ?? '').trim();
    if (!clean) return { canceled: true };
    try {
      fs.writeFileSync(clean, JSON.stringify(data, null, 2), 'utf8');
      addRecentProject(clean);
      buildMenu(mainWindow);
      return { canceled: false, filePath: clean };
    } catch (err) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Falha ao salvar projeto',
        message: 'Não foi possível salvar o arquivo de projeto.',
        detail: String(err?.message || err),
      });
      return { canceled: true };
    }
  });

  ipcMain.handle('project:saveAs', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar projeto (ICS Analyzer)',
      defaultPath: 'projeto.icsproj.json',
      filters: [
        { name: 'Projeto ICS Analyzer', extensions: ['json'] },
      ],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('app:checkUpdates', async () => {
    const current = app.getVersion();
    const apiUrl = 'https://api.github.com/repos/ldvsantos/ICS_Analyzer/releases/latest';

    try {
      const latest = await fetchJson(apiUrl);
      const tag = latest?.tag_name || latest?.name || '';
      const htmlUrl = latest?.html_url || 'https://github.com/ldvsantos/ICS_Analyzer/releases/latest';
      const cmp = compareVersions(tag, current);

      if (cmp > 0) {
        const res = await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Atualização disponível',
          message: 'Existe uma versão mais recente do ICS Analyzer.',
          detail: `Instalado: ${current}\nDisponível: ${tag}\n\nDeseja abrir a página de download?`,
          buttons: ['Abrir downloads', 'Agora não'],
          defaultId: 0,
          cancelId: 1,
        });
        if (res.response === 0) await shell.openExternal(htmlUrl);
      } else {
        await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Atualizações',
          message: 'Você já está na versão mais recente.',
          detail: `Versão instalada: ${current}`,
        });
      }

      return true;
    } catch (err) {
      await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Atualizações',
        message: 'Não foi possível verificar atualizações agora.',
        detail: String(err?.message || err),
      });
      return false;
    }
  });
}

app.whenReady().then(() => {
  const mainWindow = createWindow();
  setupIpc(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createWindow();
      setupIpc(win);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
