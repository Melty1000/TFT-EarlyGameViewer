import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("Tauri startup and shell permissions", () => {
  it("starts the Rust Tauri app with URL opener support", () => {
    const cargo = read("src-tauri/Cargo.toml");
    const main = read("src-tauri/src/main.rs");

    expect(cargo).toContain('name = "opnr-gg"');
    expect(cargo).toContain("tauri =");
    expect(cargo).toContain("tauri-plugin-opener");
    expect(main).toContain(".plugin(tauri_plugin_opener::init())");
    expect(main).toContain("tauri::generate_context!()");
  });

  it("allows only the desktop shell APIs used by the app chrome", () => {
    const capability = JSON.parse(read("src-tauri/capabilities/default.json")) as {
      windows: string[];
      permissions: Array<string | { identifier: string }>;
    };

    expect(capability.windows).toEqual(["main"]);
    expect(capability.permissions).toContain("core:window:default");
    expect(capability.permissions).toContain("core:window:allow-close");
    expect(capability.permissions).toContain("core:window:allow-minimize");
    expect(capability.permissions).toContain("core:window:allow-toggle-maximize");
    expect(capability.permissions).toContain("core:window:allow-start-dragging");
    expect(capability.permissions).toContain("opener:default");
  });
});
