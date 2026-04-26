import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function cssBlock(selector: string) {
  const css = cssSource();
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "m").exec(css);

  expect(match, `Expected to find CSS block for ${selector}`).not.toBeNull();

  return match?.[1] ?? "";
}

function cssSource() {
  return readFileSync("src/styles.css", "utf8");
}

describe("inspector layout CSS", () => {
  it("lets inspector content determine visible height instead of reserving empty vertical space", () => {
    expect(cssSource()).not.toMatch(/\.detail-full-inspector\.has-inspector\s*\{[^}]*\bmin-height\s*:/m);
    expect(cssBlock(".inspector-content")).not.toMatch(/(^|[;\s])height\s*:/);
    expect(cssBlock(".inspector-content")).toMatch(/\bmax-height\s*:/);
  });
});
