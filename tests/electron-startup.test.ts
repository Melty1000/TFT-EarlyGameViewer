import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Electron startup visibility", () => {
  it("does not depend only on ready-to-show to reveal the frameless window", () => {
    const mainProcess = readFileSync("electron/main.cjs", "utf8");

    expect(mainProcess).toContain("app.disableHardwareAcceleration()");
    expect(mainProcess).toContain('app.commandLine.appendSwitch("disable-gpu")');
    expect(mainProcess).toContain('app.commandLine.appendSwitch("disable-gpu-sandbox")');
    expect(mainProcess).toContain('app.commandLine.appendSwitch("in-process-gpu")');
    expect(mainProcess).toContain('mainWindow.once("ready-to-show"');
    expect(mainProcess).toContain('mainWindow.webContents.once("did-finish-load"');
    expect(mainProcess).toContain('mainWindow.webContents.once("did-fail-load"');
    expect(mainProcess).toContain("setTimeout(() => revealWindow(mainWindow), 1500)");
  });
});
