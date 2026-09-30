import { describe, expect, it } from "vitest";
import { buildCalendar, foldLine, icsDate } from "./ics-writer";

describe("ics writer", () => {
  it("formats UTC times the way calendars expect", () => {
    expect(icsDate(new Date("2031-03-10T14:05:09.123Z"))).toBe("20310310T140509Z");
  });

  it("leaves short lines alone and folds long ones at 75 octets, continuing with a space", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
    const folded = foldLine(`SUMMARY:${"x".repeat(200)}`);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) expect(Buffer.byteLength(p, "utf8")).toBeLessThanOrEqual(75);
    for (const p of parts.slice(1)) expect(p.startsWith(" ")).toBe(true);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(`SUMMARY:${"x".repeat(200)}`);
  });

  it("never cuts a multi-byte character in half when folding", () => {
    const line = `SUMMARY:${"é🤖".repeat(60)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    for (const p of parts) expect(Buffer.byteLength(p, "utf8")).toBeLessThanOrEqual(75);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(line);
  });

  it("escapes commas, semicolons, backslashes and newlines in text", () => {
    const out = buildCalendar("Team; shifts", [
      { uid: "a@x", start: new Date("2031-03-10T14:00:00Z"), end: new Date("2031-03-10T16:00:00Z"), summary: "Pit, crew; A\\B", description: "line one\nline two", stamp: new Date("2031-01-01T00:00:00Z") },
    ]);
    expect(out).toContain("X-WR-CALNAME:Team\\; shifts");
    expect(out).toContain("SUMMARY:Pit\\, crew\\; A\\\\B");
    expect(out).toContain("DESCRIPTION:line one\\nline two");
  });

  it("is a well-formed calendar with CRLF line endings", () => {
    const out = buildCalendar("Shifts", [{ uid: "a@x", start: new Date("2031-03-10T14:00:00Z"), end: new Date("2031-03-10T16:00:00Z"), summary: "A", status: "TENTATIVE", sequence: 1, stamp: new Date("2031-01-01T00:00:00Z") }]);
    expect(out.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(out.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(out).not.toMatch(/[^\r]\n/);
    expect(out).toContain("STATUS:TENTATIVE");
    expect(out).toContain("SEQUENCE:1");
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("a text value can't inject extra calendar lines, whatever kind of line break it uses", () => {
    const evil = "Innocent\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Evil\rATTENDEE:mailto:x@y.z\nURL:http://evil.example\u2028ORGANIZER:a\u0000b";
    const out = buildCalendar("Shifts", [{ uid: "a@x", start: new Date("2031-03-10T14:00:00Z"), end: new Date("2031-03-10T16:00:00Z"), summary: evil, description: evil, location: evil, stamp: new Date("2031-01-01T00:00:00Z") }]);
    const lines = out.split("\r\n");
    // Exactly one real event, and no line that the attacker controls the start of.
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(1);
    expect(lines.some((l) => /^(ATTENDEE|ORGANIZER)/.test(l))).toBe(false);
    expect(lines.filter((l) => l.startsWith("URL:"))).toHaveLength(0);
    expect(out).not.toMatch(/[\u0000\u2028]/);
    // No bare CR or LF anywhere except as part of the CRLF line endings.
    expect(out.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
});
