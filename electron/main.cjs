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

app.commandLine.appendSwitch("disable-gpu-sandbox");

if (process.platform === "win32") {
  app.setAppUserModelId("gg.opnr.viewer");
}

let mainWindow = null;

function writeStartupLog(message) {
  if (process.env.OPNR_DEBUG_STARTUP !== "1") return;

  const logFile = path.join(app.getPath("userData"), "startup.log");
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logFile, line, "utf8");
}

function revealWindow(window) {
  if (window && !window.isDestroyed() && !window.isVisible()) {
    writeStartupLog("show window");
    window.show();
  }
}

function logRendererState(label) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindow.webContents
    .executeJavaScript(
      `JSON.stringify({
        label: ${JSON.stringify(label)},
        url: location.href,
        readyState: document.readyState,
        bodyTextLength: document.body?.innerText?.length ?? -1,
        bodyText: (document.body?.innerText || "").slice(0, 160),
        rootChildCount: document.querySelector("#root")?.childElementCount ?? -1,
        rootHtmlLength: document.querySelector("#root")?.innerHTML?.length ?? -1
      })`
    )
    .then((result) => writeStartupLog(`renderer-state ${result}`))
    .catch((error) => writeStartupLog(`renderer-state-failed ${label}: ${error.message}`));
}

function createWindow() {
  writeStartupLog(`createWindow resources=${process.resourcesPath || ""} dirname=${__dirname}`);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#08090d",
    frame: false,
    thickFrame: false,
    roundedCorners: false,
    titleBarStyle: "hidden",
    show: false,
    icon: APP_ICON || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.on("did-start-loading", () => writeStartupLog("did-start-loading"));
  mainWindow.webContents.on("dom-ready", () => {
    writeStartupLog("dom-ready");
    logRendererState("dom-ready");
  });
  mainWindow.webContents.on("did-stop-loading", () => {
    writeStartupLog("did-stop-loading");
    logRendererState("did-stop-loading");
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) =>
    writeStartupLog(`render-process-gone ${JSON.stringify(details)}`)
  );
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) =>
    writeStartupLog(`console ${level} ${sourceId}:${line} ${message}`)
  );
  mainWindow.on("unresponsive", () => writeStartupLog("window-unresponsive"));
  mainWindow.on("responsive", () => writeStartupLog("window-responsive"));

  mainWindow.once("ready-to-show", () => revealWindow(mainWindow));
  mainWindow.webContents.once("did-finish-load", () => revealWindow(mainWindow));
  mainWindow.webContents.once("did-finish-load", () => {
    writeStartupLog("did-finish-load");
    logRendererState("did-finish-load");
  });
  mainWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    writeStartupLog(
      `did-fail-load code=${errorCode} description=${errorDescription} url=${validatedURL} main=${isMainFrame}`
    );
    revealWindow(mainWindow);
  });

  setTimeout(() => {
    logRendererState("timeout-1500");
    revealWindow(mainWindow);
  }, 1500);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("maximize", () => mainWindow.webContents.send("window:maximized", true));
  mainWindow.on("unmaximize", () => mainWindow.webContents.send("window:maximized", false));

  const devUrl = process.env.OPNR_DEV_URL;
  if (devUrl) {
    writeStartupLog(`loadURL ${devUrl}`);
    mainWindow.loadURL(devUrl);
    return;
  }

  const indexHtml = path.join(__dirname, "..", "dist", "index.html");
  writeStartupLog(`loadFile ${indexHtml}`);
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
