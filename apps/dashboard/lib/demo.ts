import { Workspace, Property, Vendor, Card, Transaction, Bill } from "./model";
// Fictional Hotelify fixtures. Never imported into research or live workspaces.
export const DEMO_DATE = "2026-11-10";
export function demoWorkspace(): Workspace {
  const locations = [
    ["Midtown", "New York", "NY", 184],
    ["Harbourside", "Boston", "MA", 142],
    ["King Street", "Charleston", "SC", 96],
    ["Resort Bay", "Miami", "FL", 238],
    ["The Gulch", "Nashville", "TN", 126],
    ["Airport", "Atlanta", "GA", 210],
    ["Congress Avenue", "Austin", "TX", 154],
    ["LoDo", "Denver", "CO", 118],
    ["Union Square", "San Francisco", "CA", 172],
    ["Downtown LA", "Los Angeles", "CA", 206],
    ["Gaslamp", "San Diego", "CA", 134],
    ["Pike Place", "Seattle", "WA", 108],
  ];
  const properties: Property[] = locations.map(
    ([name, city, state, rooms], i) => ({
      id: `property-${i}`,
      name: `Hotelify ${name}`,
      city: String(city),
      state: String(state),
      rooms: Number(rooms),
    }),
  );
  const vendors: Vendor[] = [
    ["Sysco", "Food & beverage"],
    ["US Foods", "Food & beverage"],
    ["Ecolab", "Rooms"],
    ["Grainger", "Maintenance"],
    ["Guest Supply", "Rooms"],
    ["Oracle Hospitality", "Software"],
    ["Con Edison", "Utilities"],
    ["American Hotel Register", "Rooms"],
    ["Google Ads", "Marketing"],
    ["Otis Elevator", "Maintenance"],
    ["Linen Services Co.", "Rooms"],
    ["Ferguson", "Maintenance"],
  ].map(([name, category], i) => ({
    id: `vendor-${i}`,
    name,
    category,
    email: `accounts@vendor${i + 1}.example`,
  }));
  const holders = [
    "Amanda Yeung",
    "Andre Bishop",
    "Claire Beaumont",
    "Sam Patel",
    "Elena Vega",
    "Priya Raman",
    "Maya Lindqvist",
    "Luis Ortega",
    "Tessa Nguyen",
    "Owen Fairbanks",
    "Grace Rossi",
    "Hannah Cho",
  ];
  const cards: Card[] = properties.map((p, i) => ({
    id: `card-${i}`,
    name: i % 3 === 0 ? "Purchasing card" : "General manager",
    holder: holders[i],
    last4: String(3125 + i * 417),
    type: i % 3 === 0 ? "Virtual" : "Physical",
    status: "active",
    limit_cents: 2500000,
    property_id: p.id,
  }));
  const amounts = [
    287450, 184220, 76490, 329900, 56400, 128000, 643250, 93840, 45200, 286000,
    174600, 89350,
  ];
  const transactions: Transaction[] = Array.from({ length: 84 }, (_, i) => {
    const vi = i % vendors.length;
    const pi = (i * 5) % 12;
    const date = new Date("2026-11-10T12:00:00Z");
    date.setDate(date.getDate() - Math.floor(i / 3));
    return {
      id: `txn-${i + 1}`,
      merchant: vendors[vi].name,
      amount_cents: amounts[vi] + Math.floor(i / 12) * 1370,
      date: date.toISOString().slice(0, 10),
      status: i % 19 === 0 ? "declined" : i < 7 ? "pending" : "cleared",
      category: vendors[vi].category,
      property_id: properties[pi].id,
      cardholder: holders[pi],
      card_id: cards[pi].id,
      mcc: [
        "5811",
        "5141",
        "2842",
        "5085",
        "5021",
        "5734",
        "4900",
        "5021",
        "7311",
        "1799",
        "7213",
        "5074",
      ][vi],
      receipt: i % 4 !== 0,
      flagged: i % 13 === 0,
      memo: i % 4 === 0 ? "" : "Monthly property operating supplies.",
    };
  });
  const bills: Bill[] = Array.from({ length: 18 }, (_, i) => ({
    id: `bill-${i}`,
    vendor_id: vendors[i % 12].id,
    property_id: properties[i % 12].id,
    number: `INV-2026-${1048 + i}`,
    amount_cents: amounts[i % 12] + i * 2350,
    currency: "USD",
    due_date: `2026-11-${String(8 + i).padStart(2, "0")}`,
    category: vendors[i % 12].category,
    description: [
      "Monthly operating supplies",
      "Property maintenance services",
      "November service agreement",
    ][i % 3],
    status:
      i < 3 ? "draft" : i < 12 ? "submitted" : i < 17 ? "approved" : "rejected",
    created_at: "2026-11-05T14:00:00Z",
  }));
  return {
    properties,
    vendors,
    cards,
    transactions,
    bills,
    expenses: [
      {
        id: "expense-1",
        property_id: "property-0",
        merchant: "Office supply run",
        amount_cents: 18450,
        category: "Administration",
        expense_date: "2026-11-09",
        memo: "Front desk supplies",
      },
    ],
    documents: [],
    activity: [
      {
        id: "activity-1",
        action: "Hotelify demo workspace created",
        entity_type: "workspace",
        entity_id: "demo",
        created_at: "2026-11-10T09:00:00Z",
      },
    ],
  };
}
