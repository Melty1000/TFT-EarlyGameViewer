import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("build browser responsive CSS", () => {
  it("does not switch build-row sizing in the 678-684px resize band", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const selectionBrowserBreakpoints = Array.from(
      styles.matchAll(/@container\s+selection-browser\s+\(max-width:\s*(\d+)px\)/g)
    ).map((match) => Number(match[1]));

    expect(selectionBrowserBreakpoints.filter((breakpoint) => breakpoint > 640 && breakpoint < 700)).toEqual([]);
  });
});
