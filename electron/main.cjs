const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const PROJECT_ROOT = path.join(__dirname, "..");
const ICON_CANDIDATES = [
  path.join(process.resourcesPath || "", "build", "icon.ico"),
  path.join(PROJECT_ROOT, "build", "icon.ico"),
  path.join(PROJECT_ROOT, "build", "icon.png")
];
const APP_ICON = ICON_CANDIDATES.find((candidate) => candidate && fs.existsSync(candidate));

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("in-process-gpu");

if (process.platform === "win32") {
  app.setAppUserModelId("gg.opnr.viewer");
}

let mainWindow = null;

function revealWindow(window) {
  if (window && !window.isDestroyed() && !window.isVisible()) {
    window.show();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0B0F1A",
    frame: false,
    titleBarStyle: "hidden",
    show: false,
    icon: APP_ICON || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => revealWindow(mainWindow));
  mainWindow.webContents.once("did-finish-load", () => revealWindow(mainWindow));
  mainWindow.webContents.once("did-fail-load", () => revealWindow(mainWindow));

  setTimeout(() => revealWindow(mainWindow), 1500);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("maximize", () => mainWindow.webContents.send("window:maximized", true));
  mainWindow.on("unmaximize", () => mainWindow.webContents.send("window:maximized", false));

  const indexHtml = path.join(__dirname, "..", "dist", "index.html");
  mainWindow.loadFile(indexHtml);
}

ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:toggle-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle("window:close", () => mainWindow?.close());
ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
