const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

const APP_ID = 'com.hilihuo.chinaroad';
const isSmokeTest = process.env.CHINA_ROAD_SMOKE_TEST === '1';

app.setAppUserModelId(APP_ID);

function createWindow() {
  const window = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#050507',
    title: '中华人文史卷',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged
    }
  });

  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  window.once('ready-to-show', () => {
    if (isSmokeTest) {
      return;
    }
    window.maximize();
    window.show();
  });

  if (isSmokeTest) {
    window.webContents.once('did-finish-load', async () => {
      try {
        const result = await window.webContents.executeJavaScript(`JSON.stringify({
          title: document.title,
          readyState: document.readyState,
          hasCanvas: Boolean(document.querySelector('#webgl-canvas')),
          hasIntro: Boolean(document.querySelector('#intro-screen'))
        })`);
        console.log(`ELECTRON_SMOKE_OK ${result}`);
      } catch (error) {
        process.exitCode = 1;
        console.error('ELECTRON_SMOKE_FAILED', error);
      } finally {
        app.quit();
      }
    });
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (url.startsWith('https://') || url.startsWith('http://')) {
        shell.openExternal(url);
      }
    }
  });
}

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
