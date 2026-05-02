import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

function ruleFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? "";
}

describe("panel layout CSS", () => {
  it("keeps build browser and detail panel drag bars on the same height token", () => {
    expect(styles).toContain("--dot-test-panel-header-height: 38px;");
    expect(ruleFor(".dot-test-build-browser-panel")).toContain(
      "grid-template-rows: var(--dot-test-panel-header-height) minmax(0, 1fr);"
    );
    expect(ruleFor(".dot-test-detail-panel")).toContain(
      "grid-template-rows: var(--dot-test-panel-header-height) minmax(0, 1fr);"
    );
    expect(ruleFor(".dot-test-detail-drag-bar")).toContain("min-height: var(--dot-test-panel-header-height);");
  });

  it("lets levelling guide boxes reflow horizontally when the panel has room", () => {
    expect(ruleFor(".dot-test-level-guide")).toContain("container-name: dot-level-guide;");
    expect(ruleFor(".dot-test-level-guide")).toContain("container-type: inline-size;");
    expect(styles).toMatch(
      /@container\s+dot-level-guide\s+\(min-width:\s*520px\)\s*\{[\s\S]*?\.dot-test-level-guide\s+\.level-guide-route\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(220px,\s*1fr\)\);/
    );
  });
});
