// What the page may know about the desktop shell (see main.cjs). `share` is the hosted address a co-op invite
// should carry instead of app://gunslinger/ (empty unless the build was given one); `quit()` closes the app.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const arg = (name) => { const a = process.argv.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : ''; };
contextBridge.exposeInMainWorld('GS_DESKTOP', {
  share: arg('gs-share'),
  version: arg('gs-version'),
  quit: () => ipcRenderer.send('gs-quit'),
});
