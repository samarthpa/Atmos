import { describe, it, expect } from "vitest";
import { parseCents, canTransition, csv } from "./model";
import { demoWorkspace } from "./demo";
describe("financial inputs", () => {
  it("converts dollars exactly to integer cents", () => {
    expect(parseCents("120.45")).toBe(12045);
    expect(parseCents("0.01")).toBe(1);
    expect(parseCents(" 10.5 ")).toBe(1050);
  });
  it.each(["0", "-5", "1.005", "NaN", "Infinity", "1e3", "1000000001", ""])(
    "rejects invalid amount %s",
    (value) => expect(() => parseCents(value)).toThrow(),
  );
});
describe("approval state machine", () => {
  it("requires submission before approval and prevents reopening approved bills", () => {
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("draft", "submitted")).toBe(true);
    expect(canTransition("submitted", "approved")).toBe(true);
    expect(canTransition("submitted", "rejected")).toBe(true);
    expect(canTransition("rejected", "draft")).toBe(true);
    expect(canTransition("approved", "draft")).toBe(false);
  });
});
it("exports quoted CSV and neutralizes spreadsheet formulas", () => {
  expect(csv([{ name: "=1+1", memo: 'a,"b"', empty: null }])).toBe(
    '"name","memo","empty"\r\n"\'=1+1","a,""b""",""',
  );
});
it("keeps demo relations coherent and identifiers unique", () => {
  const w = demoWorkspace();
  for (const rows of Object.values(w))
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  for (const b of w.bills) {
    expect(w.properties.some((p) => p.id === b.property_id)).toBe(true);
    expect(w.vendors.some((v) => v.id === b.vendor_id)).toBe(true);
    expect(Number.isSafeInteger(b.amount_cents)).toBe(true);
  }
  for (const t of w.transactions) {
    expect(w.cards.some((c) => c.id === t.card_id)).toBe(true);
    expect(typeof t.mcc).toBe("string");
  }
});
