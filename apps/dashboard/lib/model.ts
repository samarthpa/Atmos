export type Property = {
  id: string;
  name: string;
  city: string;
  state: string;
  rooms: number | null;
};
export type Vendor = {
  id: string;
  name: string;
  email: string;
  category: string;
};
export type BillStatus = "draft" | "submitted" | "approved" | "rejected";
export type Bill = {
  id: string;
  vendor_id: string;
  property_id: string;
  number: string;
  amount_cents: number;
  currency: string;
  due_date: string;
  category: string;
  description: string;
  status: BillStatus;
  created_at: string;
  updated_at?: string;
};
export type Expense = {
  id: string;
  property_id: string;
  merchant: string;
  amount_cents: number;
  category: string;
  expense_date: string;
  memo: string;
};
export type Transaction = {
  id: string;
  merchant: string;
  amount_cents: number;
  date: string;
  status: "cleared" | "pending" | "declined";
  category: string;
  property_id: string;
  cardholder: string;
  card_id: string;
  mcc: string;
  receipt: boolean;
  flagged: boolean;
  memo: string;
};
export type Card = {
  id: string;
  name: string;
  holder: string;
  last4: string;
  type: "Physical" | "Virtual";
  status: "active" | "frozen";
  limit_cents: number;
  property_id: string;
};
export type Activity = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
};
export type Document = {
  id: string;
  bill_id: string;
  name: string;
  path: string;
};
export type Workspace = {
  properties: Property[];
  vendors: Vendor[];
  bills: Bill[];
  expenses: Expense[];
  transactions: Transaction[];
  cards: Card[];
  activity: Activity[];
  documents: Document[];
};
export const emptyWorkspace = (): Workspace => ({
  properties: [],
  vendors: [],
  bills: [],
  expenses: [],
  transactions: [],
  cards: [],
  activity: [],
  documents: [],
});
export const categories = [
  "Food & beverage",
  "Rooms",
  "Maintenance",
  "Utilities",
  "Software",
  "Marketing",
  "Administration",
  "Other",
];
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export const shortMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
export function parseCents(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter a positive amount with at most two decimal places.");
  const [d, c = ""] = value.trim().split(".");
  const n = Number(d) * 100 + Number(c.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n <= 0 || n > 100000000000)
    throw new Error("Enter an amount between $0.01 and $1,000,000,000.");
  return n;
}
export const displayDate = (s: string) =>
  new Date(s.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export function canTransition(from: BillStatus, to: BillStatus) {
  return (
    (from === "draft" && to === "submitted") ||
    (from === "submitted" && (to === "approved" || to === "rejected")) ||
    (from === "rejected" && to === "draft")
  );
}
export function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const fields = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [
    fields.map(escape).join(","),
    ...rows.map((r) => fields.map((f) => escape(r[f])).join(",")),
  ].join("\r\n");
}
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  const url = URL.createObjectURL(
    new Blob([csv(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
