import { describe, expect, it } from "vitest";
import { initialsOf } from "./initials";

describe("initialsOf", () => {
  it("uses first and last word", () => {
    expect(initialsOf("Alex Radu")).toBe("AR");
    expect(initialsOf("Mary Jane Watson")).toBe("MW");
  });
  it("handles one word, extra spaces and lowercase", () => {
    expect(initialsOf("alex")).toBe("A");
    expect(initialsOf("  alex   radu  ")).toBe("AR");
  });
  it("handles emoji and non-Latin letters without splitting a character", () => {
    expect(initialsOf("🙂 Smile")).toBe("🙂S");
    expect(initialsOf("李 雷")).toBe("李雷");
  });
  it("never returns empty", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });
});
