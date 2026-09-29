import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
  it("neutralises spreadsheet formula injection", () => {
    for (const evil of ["=SUM(A1:A9)", "+1+1", "-2+3", "@cmd", "\t=1", "\r=1"]) {
      const out = csvCell(evil);
      expect(out.replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(csvCell("=HYPERLINK(\"http://x\",\"y\")")).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
  });
  it("leaves ordinary text, numbers and negatives alone", () => {
    expect(csvCell("Ada Admin")).toBe("Ada Admin");
    expect(csvCell(12.5)).toBe("12.5");
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(null)).toBe("");
    expect(csvCell(true)).toBe("true");
  });
  it("writes dates as ISO and handles unicode", () => {
    expect(csvCell(new Date("2026-01-05T20:00:00Z"))).toBe("2026-01-05T20:00:00.000Z");
    expect(csvCell("José Müller")).toBe("José Müller");
  });
  it("starts with a BOM and uses CRLF", () => {
    const out = toCsv(["a", "b"], [[1, "x,y"]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toBe('﻿a,b\r\n1,"x,y"\r\n');
  });
  it("neutralises formulas in the header row too", () => {
    expect(toCsv(["=bad"], []).includes("'=bad")).toBe(true);
  });
});
