import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("commit workflow hooks", () => {
  it("uses Husky with typecheck and commit metadata hooks", () => {
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const preCommit = readProjectFile(".husky/pre-commit");
    const prepareCommitMsg = readProjectFile(".husky/prepare-commit-msg");
    const commitMsg = readProjectFile(".husky/commit-msg");

    expect(packageJson.scripts.prepare).toBe("husky");
    expect(packageJson.scripts.typecheck).toBe("tsc --noEmit");
    expect(packageJson.devDependencies.husky).toBeDefined();
    expect(preCommit).toContain("npm run typecheck");
    expect(prepareCommitMsg).toContain("melty.aiModel");
    expect(prepareCommitMsg).toContain("[AI: ");
    expect(prepareCommitMsg).toContain("Machine: ");
    expect(commitMsg).toContain("Commit metadata is required.");
    expect(commitMsg).toContain("[AI:");
  });
});
