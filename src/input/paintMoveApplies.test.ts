import { describe, expect, it } from "vitest";
import { paintMoveApplies } from "./bindCamera";

describe("paintMoveApplies", () => {
  it("applies when the primary button is down", () => {
    expect(paintMoveApplies(1)).toBe(true);
  });

  it("does not apply when no buttons are down", () => {
    expect(paintMoveApplies(0)).toBe(false);
  });

  it("does not apply when only non-primary buttons are down", () => {
    expect(paintMoveApplies(2)).toBe(false);
    expect(paintMoveApplies(4)).toBe(false);
    expect(paintMoveApplies(6)).toBe(false);
  });
});
