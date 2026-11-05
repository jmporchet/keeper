import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

async function lintFixture(relativePath: string): Promise<ESLint.LintResult> {
  const eslint = new ESLint({ ignore: false });
  const results = await eslint.lintFiles([relativePath]);
  const result = results[0];
  if (result === undefined) {
    throw new Error(`ESLint produced no result for ${relativePath}`);
  }
  return result;
}

function ruleIds(result: ESLint.LintResult): string[] {
  return result.messages.map((message) => {
    if (message.ruleId === null) {
      throw new Error(message.message);
    }
    return message.ruleId;
  });
}

function messagesFor(result: ESLint.LintResult, ruleId: string): string[] {
  return result.messages.filter((message) => message.ruleId === ruleId).map((message) => message.message);
}

describe("lint guardrails", () => {
  it("forbids comments", async () => {
    const bad = await lintFixture("fixtures/eslint/comments.bad.ts");
    const good = await lintFixture("fixtures/eslint/comments.good.ts");
    expect(ruleIds(bad)).toContain("local/no-comments");
    expect(ruleIds(good)).not.toContain("local/no-comments");
    expect(good.errorCount).toBe(0);
  });

  it("forbids any", async () => {
    const bad = await lintFixture("fixtures/eslint/any.bad.ts");
    const good = await lintFixture("fixtures/eslint/any.good.ts");
    expect(ruleIds(bad)).toContain("@typescript-eslint/no-explicit-any");
    expect(ruleIds(good)).not.toContain("@typescript-eslint/no-explicit-any");
    expect(good.errorCount).toBe(0);
  });

  it("requires exhaustive switch over unions", async () => {
    const bad = await lintFixture("fixtures/eslint/switch.bad.ts");
    const good = await lintFixture("fixtures/eslint/switch.good.ts");
    expect(ruleIds(bad)).toContain("@typescript-eslint/switch-exhaustiveness-check");
    expect(ruleIds(good)).not.toContain("@typescript-eslint/switch-exhaustiveness-check");
    expect(good.errorCount).toBe(0);
  });

  it("forbids DOM globals in src/sim", async () => {
    const bad = await lintFixture("fixtures/eslint/sim/dom.bad.ts");
    const good = await lintFixture("fixtures/eslint/sim/pure.good.ts");
    expect(ruleIds(bad)).toContain("no-restricted-globals");
    expect(ruleIds(good)).not.toContain("no-restricted-globals");
    expect(good.errorCount).toBe(0);
  });

  it("forbids three imports in src/sim", async () => {
    const bad = await lintFixture("fixtures/eslint/sim/three.bad.ts");
    expect(ruleIds(bad)).toContain("no-restricted-imports");
    expect(messagesFor(bad, "no-restricted-imports").join("\n")).toMatch(/three/);
  });

  it("forbids render imports in src/sim", async () => {
    const bad = await lintFixture("fixtures/eslint/sim/render.bad.ts");
    expect(ruleIds(bad)).toContain("no-restricted-imports");
    expect(messagesFor(bad, "no-restricted-imports").join("\n")).toMatch(/render/);
  });

  it("forbids allocation in hot files and allows a tight loop", async () => {
    const bad = await lintFixture("fixtures/eslint/alloc.hot.ts");
    const good = await lintFixture("fixtures/eslint/ok.hot.ts");
    const syntax = messagesFor(bad, "no-restricted-syntax");
    expect(syntax.some((message) => message.includes("object literals"))).toBe(true);
    expect(syntax.some((message) => message.includes("array literals"))).toBe(true);
    expect(syntax.some((message) => message.includes("new"))).toBe(true);
    expect(syntax.some((message) => message.includes("closures"))).toBe(true);
    expect(syntax.some((message) => message.includes("spread"))).toBe(true);
    expect(syntax.some((message) => message.includes("Array#map"))).toBe(true);
    expect(syntax.some((message) => message.includes("Array#filter"))).toBe(true);
    expect(syntax.some((message) => message.includes("Array#slice"))).toBe(true);
    expect(syntax.some((message) => message.includes("Array#concat"))).toBe(true);
    expect(ruleIds(good)).not.toContain("no-restricted-syntax");
    expect(good.errorCount).toBe(0);
  });
});
