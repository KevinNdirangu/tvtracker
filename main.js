const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow () {
    const win = new BrowserWindow({
        width: 1300, 
        height: 900, 
        autoHideMenuBar: true,
        webPreferences: { 
            nodeIntegration: false, 
            contextIsolation: true 
        }
    });
    
    // Maximizes window on startup
    win.maximize();
    
    // The entire application logic is now running inside the HTML/JS frontend!
    win.loadFile('index.html');
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