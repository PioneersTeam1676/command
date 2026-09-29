import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LICENSE_TEXT } from "./license-text";
import { PRIVACY } from "./privacy";
import { TERMS } from "./terms";

describe("legal documents", () => {
  it("LICENSE file matches the text served at /license", () => {
    expect(readFileSync(path.join(process.cwd(), "LICENSE"), "utf8")).toBe(LICENSE_TEXT);
  });
  it("have a valid ISO 'updated' date and content", () => {
    for (const doc of [PRIVACY, TERMS]) {
      expect(doc.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.sections.length).toBeGreaterThan(5);
    }
  });
  it("privacy policy discloses every field the registry sends", () => {
    const text = JSON.stringify(PRIVACY).toLowerCase();
    for (const term of ["install id", "version", "team name", "team number", "region", "active members", "integrity", "30 days"]) {
      expect(text).toContain(term);
    }
  });
});
