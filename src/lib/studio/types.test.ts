import { describe, expect, it } from "vitest";
import { validateLength, totalLength, defaultData } from "./types";

describe("video length rule (20–60s)", () => {
  it("rejects under 20 seconds", () => expect(validateLength(19.9)).not.toBeNull());
  it("accepts 20 seconds", () => expect(validateLength(20)).toBeNull());
  it("accepts 60 seconds", () => expect(validateLength(60)).toBeNull());
  it("rejects over 60 seconds", () => expect(validateLength(60.1)).not.toBeNull());
  it("ignores removed scenes in the total", () => {
    const d = defaultData({
      scenes: [
        { id: "a", text: "", visualPrompt: "", duration: 0, source: "original", keep: true, start: 0, end: 25 },
        { id: "b", text: "", visualPrompt: "", duration: 0, source: "original", keep: false, start: 25, end: 50 },
      ],
    });
    expect(totalLength(d)).toBe(25);
  });
});
