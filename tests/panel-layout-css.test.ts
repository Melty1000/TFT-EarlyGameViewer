import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const dotMatrixTestPage = readFileSync(resolve(process.cwd(), "src/components/DotMatrixTestPage.tsx"), "utf8");

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

  it("keeps selected board stars and item pips attached to the hexes", () => {
    expect(ruleFor(".dot-test-panel-selectedBoard .champ-star-badge.stars-3 .champ-star-mark:nth-child(2)")).toContain(
      "left: 50%;"
    );
    expect(ruleFor(".dot-test-panel-selectedBoard .board-item-icon.item-slot-1")).toContain("left: 28%;");
    expect(styles).toMatch(
      /\.dot-test-panel-selectedBoard\s+\.board-item-icon\.item-slot-2\s*\{[\s\S]*?left:\s*50%;/
    );
    expect(styles).toMatch(
      /\.dot-test-panel-selectedBoard\s+\.board-item-icon\.item-slot-3\s*\{[\s\S]*?left:\s*72%;/
    );
    expect(ruleFor(".dot-test-panel-selectedBoard .board-slot.filled.cost-3")).toContain(
      "--opnr-board-cost-color: #54d7ff;"
    );
  });

  it("lets selected board content scale past the old content cap", () => {
    expect(dotMatrixTestPage).toContain(
      "setHexSize(Math.round(Math.max(Math.min(widthBound / 0.8660254, heightBound), 24)));"
    );
    expect(dotMatrixTestPage).not.toContain("clamp(Math.min(widthBound / 0.8660254, heightBound), 24, 72)");
    expect(ruleFor(".dot-test-panel-selectedBoard .champ-star-badge")).toContain(
      "font-size: max(8px, calc(var(--hex-height) * 0.22));"
    );
    expect(styles).toMatch(
      /\.dot-test-panel-selectedBoard\s+\.board-item-icon,[\s\S]*?--opnr-board-item-size:\s*max\(9px,\s*calc\(var\(--opnr-board-hex-height,\s*38px\)\s*\*\s*0\.28\)\);/
    );
  });

  it("adapts components holder rows to narrow panel widths", () => {
    expect(ruleFor(".dot-test-components-panel")).toContain("container-type: inline-size;");
    expect(ruleFor(".dot-test-item-holder-list")).toContain("container-name: dot-item-holders;");
    expect(ruleFor(".dot-test-item-holder-list")).toContain("display: flex;");
    expect(ruleFor(".dot-test-item-holder-list")).toContain("flex-wrap: wrap;");
    expect(ruleFor(".dot-test-item-holder-row")).toContain("width: max-content;");
    expect(ruleFor(".dot-test-holder-item-button.has-recipe")).toContain("grid-template-columns: 22px auto;");
    expect(ruleFor(".dot-test-holder-item-recipe img")).toContain("width: 13px;");
    expect(styles).toMatch(
      /@container\s+\(max-width:\s*180px\)\s*\{[\s\S]*?\.dot-test-item-section-list\s*\{[\s\S]*?scrollbar-gutter:\s*auto;/
    );
    expect(styles).toMatch(
      /@container\s+dot-item-holders\s+\(max-width:\s*124px\)\s*\{[\s\S]*?\.dot-test-item-holder-row\s*\{[\s\S]*?grid-template-columns:\s*1fr;/
    );
    expect(styles).toMatch(
      /@container\s+dot-item-holders\s+\(max-width:\s*104px\)\s*\{[\s\S]*?\.dot-test-holder-item-button\s*\{[\s\S]*?width:\s*22px;/
    );
    expect(dotMatrixTestPage).toContain('className="dot-test-components-counts"');
  });

  it("keeps board phase control state separate from the build browser selector", () => {
    expect(dotMatrixTestPage).toContain("const [selectedBoardPhase, setSelectedBoardPhase]");
    expect(dotMatrixTestPage).toContain('label="Board Phase"');
    expect(dotMatrixTestPage).not.toContain("List Phase");
    expect(ruleFor(".dot-test-board-toolbar")).toContain("grid-template-columns: minmax(0, 1fr) auto;");
    expect(ruleFor(".dot-test-panel-selectedBoard .dot-test-browser-phase-control > span")).toContain("display: none;");
  });

  it("removes evidence readouts from the build browser chrome", () => {
    expect(styles).not.toContain(".source-evidence-count");
    expect(styles).not.toContain("selection-evidence-readout");
  });

  it("keeps dense UI labels on the readable app font stack instead of terminal fallbacks", () => {
    const monoToken = styles.match(/--aptos-font-mono:\s*([^;]+);/)?.[1] ?? "";

    expect(monoToken).toContain("Rajdhani");
    expect(monoToken).not.toMatch(/DM Mono|Courier|Consolas|monospace/i);
  });
});
