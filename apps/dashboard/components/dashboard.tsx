"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CreditCard,
  Receipt,
  FileText,
  ArrowLeftRight,
  BookOpen,
  Gauge,
  Building2,
  Users,
  Settings,
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  Plus,
  Download,
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  SlidersHorizontal,
  Menu,
  X,
  ShieldCheck,
  Paperclip,
  Upload,
  ExternalLink,
  Lock,
  MoreHorizontal,
  RefreshCw,
  LogOut,
  HelpCircle,
  Wallet,
  FileCheck,
  Link2,
  ArrowDownLeft,
  AlertCircle,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useWorkspace } from "@/lib/workspace";
import {
  Bill,
  Card,
  Transaction,
  Expense,
  Vendor,
  Property,
  Activity,
  money,
  shortMoney,
  displayDate,
  downloadCsv,
  categories,
} from "@/lib/model";
import { DEMO_DATE } from "@/lib/demo";
import { supabase } from "@/lib/supabase";
import { openDemoDocument, saveDemoDocument } from "@/lib/documents";
import {
  Badge,
  Button,
  Drawer,
  Empty,
  Field,
  Modal,
  SearchField,
  Stat,
  Status,
  cx,
} from "./ui";
import {
  AuthForm,
  BillForm,
  ExpenseForm,
  PropertyForm,
  VendorForm,
  errorMessage,
} from "./forms";
import { DataTable } from "./data-table";

const navigation = [
  {
    name: "Card",
    icon: CreditCard,
    path: "/card/transactions/",
    children: [
      ["Transactions", "/card/transactions/"],
      ["Analytics", "/card/analytics/"],
      ["Cards", "/card/cards/"],
      ["Statements", "/card/statements/"],
      ["Card policies", "/card/policies/"],
    ],
  },
  { name: "Expenses", icon: Receipt, path: "/expenses/" },
  {
    name: "Bill Pay",
    icon: FileText,
    path: "/billpay/approvals/",
    children: [
      ["Bills for approval", "/billpay/approvals/"],
      ["Bill drafts", "/billpay/drafts/"],
      ["Vendors", "/billpay/vendors/"],
    ],
  },
  { name: "Payments", icon: ArrowLeftRight, path: "/payments/" },
  { name: "Accounting", icon: BookOpen, path: "/accounting/" },
  { name: "Credit", icon: Gauge, path: "/credit/" },
];
const lowerNav = [
  { name: "Properties", icon: Building2, path: "/properties/" },
  { name: "Team", icon: Users, path: "/team/" },
  { name: "Settings", icon: Settings, path: "/settings/" },
];
const titles: Record<string, [string, string]> = {
  transactions: [
    "Transactions",
    "Every purchase. Every property. One clear picture.",
  ],
  analytics: [
    "Spend analytics",
    "Understand where your money goes, across your portfolio.",
  ],
  cards: ["Corporate cards", "The right spending power, in the right hands."],
  statements: ["Statements", "Your monthly card activity, ready to reconcile."],
  policies: ["Card policies", "Clear guardrails for confident spending."],
  expenses: ["Expenses", "Keep property expenses organized and accounted for."],
  approvals: [
    "Bills for approval",
    "Review, approve, and keep your properties moving.",
  ],
  drafts: [
    "Bill drafts",
    "Get every detail right before sending for approval.",
  ],
  vendors: ["Vendors", "The partners that keep your properties running."],
  payments: ["Payments", "One place to prepare and track outgoing payments."],
  accounting: ["Accounting", "From daily activity to a clean month-end close."],
  credit: [
    "Credit overview",
    "A clear view of your available spending capacity.",
  ],
  properties: ["Properties", "Your entire portfolio, connected."],
  team: ["Team", "The people behind your properties."],
  settings: ["Settings", "Make this workspace work for your team."],
};
const initials = (s: string) =>
  s
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
const merchantColors = ["mint", "peach", "violet", "blue", "sand"];
function Merchant({
  name,
  sub,
  index = 0,
}: {
  name: string;
  sub?: string;
  index?: number;
}) {
  return (
    <div className="merchant">
      <span className={cx("merchant-logo", merchantColors[index % 5])}>
        {initials(name)}
      </span>
      <div>
        <strong>{name}</strong>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}
function KV({ name, value }: { name: string; value: React.ReactNode }) {
  return (
    <div className="kv">
      <dt>{name}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function Dashboard() {
  const w = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const path =
    pathname === "/"
      ? "/card/transactions/"
      : pathname.endsWith("/")
        ? pathname
        : pathname + "/";
  const section = path.split("/").filter(Boolean).at(-1) ?? "transactions";
  const [title, subtitle] = titles[section] ?? titles.transactions;
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState("all");
  const [dateRange, setDateRange] = useState("30");
  const [mobile, setMobile] = useState(false);
  const [modal, setModal] = useState("");
  const [detail, setDetail] = useState<{
    kind: "bill" | "transaction" | "vendor" | "property";
    id: string;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [actionBusy, setActionBusy] = useState(false);
  const [command, setCommand] = useState("");
  const [memo, setMemo] = useState("");
  const [policy, setPolicy] = useState({
    receipts: true,
    threshold: "75",
    limits: true,
  });
  const data = w.data;
  const propertyName = (id: string) =>
    data.properties.find((p) => p.id === id)?.name ?? "Unknown property";
  const vendorName = (id: string) =>
    data.vendors.find((v) => v.id === id)?.name ?? "Unknown vendor";
  const scoped = (id: string) => scope === "all" || id === scope;
  const notify = (message: string) => {
    setToast(message);
  };
  const run = async (fn: () => Promise<unknown>, message?: string) => {
    setActionBusy(true);
    try {
      await fn();
      if (message) notify(message);
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setActionBusy(false);
    }
  };
  useEffect(() => {
    setSearch("");
    setStatus("all");
    setCategory("all");
    setView(section === "drafts" ? "draft" : "all");
    setSelected([]);
    setDetail(null);
    setMobile(false);
  }, [path, section]);
  useEffect(() => {
    setScope("all");
    setDetail(null);
    setSelected([]);
  }, [w.mode]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setModal("search");
      }
    };
    window.addEventListener("keydown", handler);
    try {
      const p = localStorage.getItem("atmos.demo.policy");
      if (p) setPolicy(JSON.parse(p));
    } catch {}
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const anchor =
    w.mode === "demo" ? new Date(DEMO_DATE + "T23:59:59Z") : new Date();
  const transactions = data.transactions.filter((t) => scoped(t.property_id));
  const spend = transactions
    .filter((t) => t.status !== "declined")
    .reduce((s, t) => s + t.amount_cents, 0);
  const pending = transactions
    .filter((t) => t.status === "pending")
    .reduce((s, t) => s + t.amount_cents, 0);
  const cardLimit =
    scope === "all"
      ? 50000000
      : data.cards
          .filter((c) => c.property_id === scope)
          .reduce((s, c) => s + c.limit_cents, 0);
  const bills = data.bills.filter((b) => scoped(b.property_id));
  const currentBill =
    detail?.kind === "bill"
      ? data.bills.find((b) => b.id === detail.id)
      : undefined;
  const currentTransaction =
    detail?.kind === "transaction"
      ? data.transactions.find((t) => t.id === detail.id)
      : undefined;
  const filteredTransactions = transactions.filter((t) => {
    const days =
      (anchor.getTime() - new Date(t.date + "T00:00:00Z").getTime()) / 86400000;
    return (
      (!search ||
        `${t.merchant} ${t.cardholder} ${t.amount_cents / 100} ${propertyName(t.property_id)}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (status === "all" || t.status === status) &&
      (category === "all" || t.category === category) &&
      (view === "all" ||
        (view === "missing" && !t.receipt) ||
        (view === "flagged" && t.flagged)) &&
      (dateRange === "all" || days < Number(dateRange))
    );
  });
  const filteredBills = bills.filter(
    (b) =>
      (!search ||
        `${vendorName(b.vendor_id)} ${b.number} ${b.description}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (view === "all"
        ? section === "approvals"
          ? b.status === "submitted"
          : true
        : b.status === view),
  );
  const busy = w.busy || actionBusy;
  const openTransaction = (t: Transaction) => {
    setMemo(t.memo);
    setDetail({ kind: "transaction", id: t.id });
  };
  const transactionColumns: ColumnDef<Transaction, unknown>[] = [
    {
      accessorKey: "merchant",
      header: "Merchant",
      cell: ({ row }) => (
        <Merchant
          name={row.original.merchant}
          sub={row.original.category}
          index={data.vendors.findIndex(
            (v) => v.name === row.original.merchant,
          )}
        />
      ),
    },
    {
      accessorKey: "amount_cents",
      header: "Amount",
      cell: ({ row }) => (
        <strong className="tabular">{money(row.original.amount_cents)}</strong>
      ),
    },
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => (
        <span className="muted nowrap">
          {displayDate(row.original.date).replace(", 2026", "")}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Status status={row.original.status} />,
    },
    {
      accessorKey: "cardholder",
      header: "Cardholder",
      cell: ({ row }) => (
        <div className="person">
          <span className="avatar tiny">
            {initials(row.original.cardholder)}
          </span>
          <span>
            {row.original.cardholder.split(" ")[0]}{" "}
            {row.original.cardholder.split(" ")[1]?.[0]}.
          </span>
        </div>
      ),
    },
    {
      accessorKey: "property_id",
      header: "Property",
      cell: ({ row }) => (
        <span className="muted nowrap">
          {propertyName(row.original.property_id).replace("Hotelify ", "")}
        </span>
      ),
    },
    {
      id: "receipt",
      header: "Receipt",
      cell: ({ row }) =>
        row.original.receipt ? (
          <CheckCircle2 size={16} className="positive" />
        ) : (
          <span className="missing">
            <Paperclip size={14} /> Missing
          </span>
        ),
    },
  ];
  const billColumns: ColumnDef<Bill, unknown>[] = [
    {
      id: "selection",
      header: () => (
        <input
          type="checkbox"
          aria-label="Select all filtered bills"
          checked={
            filteredBills.length > 0 &&
            filteredBills.every((b) => selected.includes(b.id))
          }
          onChange={(e) =>
            setSelected(e.target.checked ? filteredBills.map((b) => b.id) : [])
          }
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.original.number}`}
          checked={selected.includes(row.original.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            setSelected((s) =>
              e.target.checked
                ? [...s, row.original.id]
                : s.filter((id) => id !== row.original.id),
            )
          }
        />
      ),
    },
    {
      id: "vendor",
      header: "Vendor / invoice",
      accessorFn: (b) => vendorName(b.vendor_id),
      cell: ({ row }) => (
        <Merchant
          name={vendorName(row.original.vendor_id)}
          sub={row.original.number}
          index={data.vendors.findIndex((v) => v.id === row.original.vendor_id)}
        />
      ),
    },
    {
      accessorKey: "amount_cents",
      header: "Amount",
      cell: ({ row }) => (
        <strong className="tabular">{money(row.original.amount_cents)}</strong>
      ),
    },
    {
      accessorKey: "due_date",
      header: "Due date",
      cell: ({ row }) => (
        <span
          className={
            row.original.due_date < anchor.toISOString().slice(0, 10) &&
            row.original.status !== "approved"
              ? "negative"
              : "muted"
          }
        >
          {displayDate(row.original.due_date).replace(", 2026", "")}
        </span>
      ),
    },
    {
      accessorKey: "property_id",
      header: "Property",
      cell: ({ row }) => (
        <span className="muted">
          {propertyName(row.original.property_id).replace("Hotelify ", "")}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Status status={row.original.status} />,
    },
    {
      id: "open",
      header: "",
      cell: () => <ChevronRight size={16} className="muted" />,
    },
  ];
  const exportTransactions = () => {
    downloadCsv(
      "atmos-transactions.csv",
      filteredTransactions.map((t) => ({
        merchant: t.merchant,
        amount_usd: (t.amount_cents / 100).toFixed(2),
        date: t.date,
        status: t.status,
        category: t.category,
        property: propertyName(t.property_id),
        cardholder: t.cardholder,
        mcc: t.mcc,
        data_kind: "fictional_demo",
      })),
    );
    notify("Transaction export downloaded");
  };
  const exportBills = () => {
    downloadCsv(
      "atmos-bills.csv",
      bills.map((b) => ({
        invoice: b.number,
        vendor: vendorName(b.vendor_id),
        property: propertyName(b.property_id),
        amount_usd: (b.amount_cents / 100).toFixed(2),
        due_date: b.due_date,
        status: b.status,
        data_kind: w.mode === "demo" ? "fictional_demo" : "operational",
      })),
    );
    notify("Bill export downloaded");
  };
  const upload = async (file: File) => {
    if (!currentBill) return;
    if (file.size > 10485760)
      throw Error("Choose a document smaller than 10 MB.");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type))
      throw Error("Choose a PDF, JPG, or PNG file.");
    const id = crypto.randomUUID();
    let path = id;
    if (w.mode === "demo") {
      await saveDemoDocument(id, file);
    } else {
      if (!supabase || !w.org) throw Error("Sign in first");
      path = `${w.org.id}/${currentBill.id}/${id}`;
      const result = await supabase.storage
        .from("atmos-documents")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (result.error) throw result.error;
    }
    await w.mutate("documents", {
      bill_id: currentBill.id,
      name: file.name,
      path,
    });
    notify("Document attached");
  };
  const openDocument = async (path: string) => {
    if (w.mode === "demo") return openDemoDocument(path);
    const result = await supabase!.storage
      .from("atmos-documents")
      .createSignedUrl(path, 60);
    if (result.error) throw result.error;
    window.open(result.data.signedUrl, "_blank", "noopener");
  };
  const finish = (message: string) => {
    setModal("");
    notify(message);
  };

  const navigationItems = (items: typeof navigation) =>
    items.map((item) => {
      const active = path.startsWith("/" + item.path.split("/")[1] + "/");
      return (
        <div key={item.name} className="nav-group">
          <Link
            className={cx("nav-item", active && "nav-parent-active")}
            href={item.path}
          >
            <item.icon size={17} />
            <span>{item.name}</span>
            {item.name === "Bill Pay" &&
              bills.filter((b) => b.status === "submitted").length > 0 && (
                <span className="nav-count">
                  {bills.filter((b) => b.status === "submitted").length}
                </span>
              )}
            {item.children &&
              (active ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
          </Link>
          {item.children && active && (
            <div className="subnav">
              {item.children.map(([name, href]) => (
                <Link
                  key={href}
                  href={href}
                  className={cx(path === href && "active")}
                >
                  {name}
                </Link>
              ))}
            </div>
          )}
        </div>
      );
    });
  const unavailable = (name: string) => (
    <div className="panel">
      <Empty
        title={`${name} is ready for a provider connection`}
        description="Your live workspace does not contain simulated financial activity. Explore the Hotelify demo to preview this experience."
        action={
          <Button onClick={() => w.setMode("demo")}>
            Explore demo <ArrowRight size={15} />
          </Button>
        }
      />
    </div>
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="icon-button mobile-toggle"
            onClick={() => setMobile(!mobile)}
            aria-label="Toggle navigation"
          >
            <Menu size={20} />
          </button>
          <button
            className="workspace-brand"
            onClick={() => setModal("workspace")}
          >
            <span className="brand-mark">H</span>
            <span>
              {w.mode === "demo"
                ? "Hotelify"
                : (w.org?.name ?? "Your workspace")}
            </span>
            <ChevronDown size={13} />
          </button>
        </div>
        <div className="topbar-right">
          <button
            className="global-search"
            aria-label="Search pages and vendors"
            onClick={() => setModal("search")}
          >
            <Search size={15} />
            <span>Search anything…</span>
            <kbd>⌘ K</kbd>
          </button>
          <span className={cx("mode-pill", w.mode === "live" && "live")}>
            {w.mode === "demo" ? "Demo workspace" : "Live workspace"}
          </span>
          <button
            className="icon-button notification-button"
            onClick={() => setModal("activity")}
            aria-label="View activity"
          >
            <Bell size={18} />
            {data.activity.length > 0 && <i />}
          </button>
          <button
            className="account-button"
            onClick={() => setModal("workspace")}
          >
            <span className="avatar">
              {w.mode === "demo"
                ? "AY"
                : initials(w.session?.user.email ?? "You")}
            </span>
            <span>
              {w.mode === "demo"
                ? "Amanda Yeung"
                : (w.session?.user.email?.split("@")[0] ?? "Sign in")}
            </span>
            <ChevronDown size={13} />
          </button>
        </div>
      </header>
      {mobile && (
        <button
          className="mobile-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={cx("sidebar", mobile && "sidebar-open")}
        aria-label="Main navigation"
      >
        <div className="sidebar-top">
          <div className="nav-label">WORKSPACE</div>
          {navigationItems(navigation)}
        </div>
        <div className="sidebar-bottom">
          {lowerNav.map((item) => (
            <Link
              key={item.name}
              href={item.path}
              className={cx("nav-item", path === item.path && "active")}
            >
              <item.icon size={17} />
              <span>{item.name}</span>
            </Link>
          ))}
          <div className="sidebar-help">
            <span className="save-dot" />
            <span>
              {w.mode === "demo"
                ? "Demo saved on this browser"
                : w.session
                  ? "Connected to Supabase"
                  : "Sign in to connect"}
            </span>
            <button
              className="icon-button"
              aria-label="Workspace help"
              onClick={() => setModal("help")}
            >
              <HelpCircle size={14} />
            </button>
          </div>
          <div className="atmos-wordmark">
            ΛTMOS <span>HOTEL FINANCE, SIMPLIFIED</span>
          </div>
        </div>
      </aside>
      <main id="main" className="main">
        <div className="breadcrumb">
          Workspace <ChevronRight size={12} />{" "}
          {navigation.find((n) =>
            path.startsWith("/" + n.path.split("/")[1] + "/"),
          )?.name ?? title}{" "}
          <span className="breadcrumb-date">
            {w.mode === "demo"
              ? "NOVEMBER 2026 · SAMPLE DATA"
              : "YOUR ORGANIZATION"}
          </span>
        </div>
        <div className="page-heading">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="heading-actions">
            <label className="property-select">
              <Building2 size={15} />
              <select
                aria-label="Property scope"
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value);
                  setSelected([]);
                }}
              >
                <option value="all">
                  All properties ({data.properties.length})
                </option>
                {data.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
            {["approvals", "drafts"].includes(section) ? (
              <Button
                variant="primary"
                disabled={!w.canWrite || busy}
                onClick={() => setModal("bill")}
              >
                <Plus size={16} /> Create bill
              </Button>
            ) : section === "vendors" ? (
              <Button
                variant="primary"
                disabled={!w.canWrite || busy}
                onClick={() => setModal("vendor")}
              >
                <Plus size={16} /> Add vendor
              </Button>
            ) : section === "properties" ? (
              <Button
                variant="primary"
                disabled={!w.canWrite || busy}
                onClick={() => setModal("property")}
              >
                <Plus size={16} /> Add property
              </Button>
            ) : section === "expenses" ? (
              <Button
                variant="primary"
                disabled={!w.canWrite || busy}
                onClick={() => setModal("expense")}
              >
                <Plus size={16} /> Add expense
              </Button>
            ) : section === "transactions" ? (
              <Button
                onClick={exportTransactions}
                disabled={!filteredTransactions.length}
              >
                <Download size={15} /> Export
              </Button>
            ) : null}
          </div>
        </div>
        {w.error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={17} />
            {w.error}
            <Button
              onClick={() => (w.mode === "live" ? w.refresh() : w.setError(""))}
            >
              Retry
            </Button>
          </div>
        )}
        {!w.ready ? (
          <div className="loading-panel">
            <RefreshCw className="spin" /> Loading your workspace…
          </div>
        ) : w.mode === "live" && !w.session ? (
          <div className="panel auth-gate">
            <ShieldCheck size={34} />
            <h2>Your properties. Your workspace.</h2>
            <p>
              Sign in to securely manage real bills, vendors, and approvals.
              <br />
              Hotelify demo records will never be copied into your live
              workspace.
            </p>
            <Button variant="primary" onClick={() => setModal("auth")}>
              Sign in to Atmos <ArrowRight size={16} />
            </Button>
          </div>
        ) : w.mode === "live" && !w.org ? (
          <div className="panel auth-gate">
            <Building2 size={34} />
            <h2>Create your organization</h2>
            <p>Start with a clean workspace for your hotel group.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () => w.createOrg(String(f.get("name")).trim()),
                  "Workspace created",
                );
              }}
            >
              <input
                name="name"
                aria-label="Organization name"
                placeholder="Your hotel group"
                required
                maxLength={120}
              />
              <Button variant="primary" disabled={busy}>
                Create workspace
              </Button>
            </form>
          </div>
        ) : (
          <>
            {section === "transactions" &&
              (w.mode === "live" ? (
                unavailable("Card transactions")
              ) : (
                <>
                  <div className="balance-panel">
                    <div className="balance-main">
                      <span className="eyebrow">
                        CURRENT CARD BALANCE <span className="live-dot" />
                      </span>
                      <div className="balance-amount">{money(spend)}</div>
                      <div className="balance-pending">
                        <span />
                        {money(pending)} pending
                      </div>
                      <div className="credit-track">
                        <span
                          style={{
                            width: `${Math.min(100, (spend / Math.max(1, cardLimit)) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="credit-caption">
                        <span>
                          Available credit{" "}
                          <strong>
                            {shortMoney(Math.max(0, cardLimit - spend))}
                          </strong>
                        </span>
                        <span>of {shortMoney(cardLimit)}</span>
                      </div>
                    </div>
                    <div className="balance-side">
                      <div className="balance-meta">
                        <div>
                          <span>Statement closes</span>
                          <strong>Nov 30, 2026</strong>
                        </div>
                        <div>
                          <span>Payment due</span>
                          <strong>Dec 16, 2026</strong>
                        </div>
                        <div>
                          <span>Autopay</span>
                          <strong>
                            <span className="positive">●</span> Demo only
                          </strong>
                        </div>
                      </div>
                      <div className="balance-links">
                        <Button
                          variant="primary"
                          onClick={() => router.push("/payments/")}
                        >
                          View payments <ArrowUpRight size={14} />
                        </Button>
                        <Link href="/card/statements/" className="text-link">
                          View statements <ArrowRight size={14} />
                        </Link>
                      </div>
                      <p className="tiny-note">
                        Illustrative card activity. No real funds or credit
                        facility.
                      </p>
                    </div>
                  </div>
                  <div
                    className="tabs"
                    role="tablist"
                    aria-label="Transaction views"
                  >
                    {[
                      ["all", "Overview", transactions.length],
                      [
                        "missing",
                        "Missing receipts",
                        transactions.filter((t) => !t.receipt).length,
                      ],
                      [
                        "flagged",
                        "Flagged",
                        transactions.filter((t) => t.flagged).length,
                      ],
                    ].map(([id, name, count]) => (
                      <button
                        key={id}
                        role="tab"
                        aria-selected={view === id}
                        onClick={() => setView(String(id))}
                        className={view === id ? "selected" : ""}
                      >
                        {name}
                        <span>{count}</span>
                      </button>
                    ))}
                    <div className="tabs-end">
                      <span className="positive">
                        <Check size={13} /> Saved locally
                      </span>
                    </div>
                  </div>
                  <div className="toolbar">
                    <SearchField
                      value={search}
                      onChange={setSearch}
                      placeholder="Search merchant, cardholder, or amount…"
                    />
                    <select
                      aria-label="Transaction status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">All statuses</option>
                      <option value="cleared">Cleared</option>
                      <option value="pending">Pending</option>
                      <option value="declined">Declined</option>
                    </select>
                    <select
                      aria-label="Transaction category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="all">All departments</option>
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Date range"
                      value={dateRange}
                      onChange={(e) => setDateRange(e.target.value)}
                    >
                      <option value="30">Last 30 days</option>
                      <option value="7">Last 7 days</option>
                      <option value="all">All dates</option>
                    </select>
                    <button
                      className="icon-button filter-clear"
                      title="Reset filters"
                      aria-label="Reset transaction filters"
                      onClick={() => {
                        setSearch("");
                        setStatus("all");
                        setCategory("all");
                        setDateRange("30");
                        setView("all");
                      }}
                    >
                      <SlidersHorizontal size={17} />
                    </button>
                  </div>
                  <DataTable
                    data={filteredTransactions}
                    columns={transactionColumns}
                    onRow={openTransaction}
                    label="Transactions"
                  />
                </>
              ))}
            {["approvals", "drafts"].includes(section) && (
              <>
                <div className="stats-row">
                  <Stat
                    label="AWAITING APPROVAL"
                    value={money(
                      bills
                        .filter((b) => b.status === "submitted")
                        .reduce((s, b) => s + b.amount_cents, 0),
                    )}
                    detail={`${bills.filter((b) => b.status === "submitted").length} bills to review`}
                  />
                  <Stat
                    label="APPROVED"
                    value={money(
                      bills
                        .filter((b) => b.status === "approved")
                        .reduce((s, b) => s + b.amount_cents, 0),
                    )}
                    detail="Ready for your payment workflow"
                    accent
                  />
                  <Stat
                    label="IN DRAFT"
                    value={money(
                      bills
                        .filter((b) => b.status === "draft")
                        .reduce((s, b) => s + b.amount_cents, 0),
                    )}
                    detail={`${bills.filter((b) => b.status === "draft").length} bills not yet submitted`}
                  />
                </div>
                <div className="tabs" role="tablist" aria-label="Bill views">
                  {[
                    [
                      "all",
                      section === "approvals" ? "Needs approval" : "All bills",
                    ],
                    ["draft", "Drafts"],
                    ["approved", "Approved"],
                    ["rejected", "Rejected"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={view === id}
                      className={view === id ? "selected" : ""}
                      onClick={() => {
                        setView(id);
                        setSelected([]);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="toolbar">
                  <SearchField
                    value={search}
                    onChange={setSearch}
                    placeholder="Search vendors or invoice numbers…"
                  />
                  <div className="toolbar-spacer" />
                  {selected.length > 0 && (
                    <>
                      <span className="muted">{selected.length} selected</span>
                      <Button
                        variant="primary"
                        disabled={
                          busy ||
                          !w.canApprove ||
                          selected.some(
                            (id) =>
                              data.bills.find((b) => b.id === id)?.status !==
                              "submitted",
                          )
                        }
                        onClick={() =>
                          void run(async () => {
                            for (const id of selected)
                              await w.transition(id, "approved");
                            setSelected([]);
                          }, "Selected bills approved")
                        }
                      >
                        <Check size={15} /> Approve selected
                      </Button>
                    </>
                  )}
                  <Button onClick={exportBills} disabled={!bills.length}>
                    <Download size={15} /> Export
                  </Button>
                </div>
                <DataTable
                  data={filteredBills}
                  columns={billColumns}
                  onRow={(b) => setDetail({ kind: "bill", id: b.id })}
                  label="Bills"
                />
              </>
            )}
            {section === "vendors" && (
              <>
                <div className="stats-row">
                  <Stat
                    label="VENDORS"
                    value={String(data.vendors.length)}
                    detail="Across your organization"
                  />
                  <Stat
                    label="OPEN BILLS"
                    value={String(
                      bills.filter((b) => b.status !== "approved").length,
                    )}
                    detail="Drafts and bills awaiting review"
                  />
                  <Stat
                    label="APPROVED PAYABLES"
                    value={money(
                      bills
                        .filter((b) => b.status === "approved")
                        .reduce((s, b) => s + b.amount_cents, 0),
                    )}
                    detail="Approved does not mean paid"
                  />
                </div>
                <div className="toolbar">
                  <SearchField
                    value={search}
                    onChange={setSearch}
                    placeholder="Search vendors…"
                  />
                  <select
                    aria-label="Vendor category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="all">All categories</option>
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <DataTable<Vendor>
                  data={data.vendors.filter(
                    (v) =>
                      v.name.toLowerCase().includes(search.toLowerCase()) &&
                      (category === "all" || v.category === category),
                  )}
                  columns={[
                    {
                      accessorKey: "name",
                      header: "Vendor",
                      cell: ({ row }) => (
                        <Merchant
                          name={row.original.name}
                          sub={row.original.email}
                          index={row.index}
                        />
                      ),
                    },
                    { accessorKey: "category", header: "Category" },
                    {
                      id: "bills",
                      header: "Bills",
                      cell: ({ row }) =>
                        bills.filter((b) => b.vendor_id === row.original.id)
                          .length,
                    },
                    {
                      id: "total",
                      header: "Total billed",
                      cell: ({ row }) => (
                        <strong>
                          {money(
                            bills
                              .filter((b) => b.vendor_id === row.original.id)
                              .reduce((s, b) => s + b.amount_cents, 0),
                          )}
                        </strong>
                      ),
                    },
                    {
                      id: "open",
                      header: "",
                      cell: () => <ChevronRight size={16} />,
                    },
                  ]}
                  onRow={(v) => setDetail({ kind: "vendor", id: v.id })}
                  label="Vendors"
                />
              </>
            )}
            {section === "expenses" && (
              <>
                <div className="stats-row">
                  <Stat
                    label="RECORDED EXPENSES"
                    value={money(
                      data.expenses
                        .filter((e) => scoped(e.property_id))
                        .reduce((s, e) => s + e.amount_cents, 0),
                    )}
                    detail={`${data.expenses.filter((e) => scoped(e.property_id)).length} expense records`}
                  />
                  <Stat
                    label="PROPERTIES"
                    value={String(
                      new Set(
                        data.expenses
                          .filter((e) => scoped(e.property_id))
                          .map((e) => e.property_id),
                      ).size,
                    )}
                    detail="With recorded expenses"
                  />
                  <Stat
                    label="EXPORT READY"
                    value={String(
                      data.expenses.filter((e) => scoped(e.property_id)).length,
                    )}
                    detail="Available for your accounting team"
                  />
                </div>
                <div className="toolbar">
                  <SearchField
                    value={search}
                    onChange={setSearch}
                    placeholder="Search expenses…"
                  />
                  <div className="toolbar-spacer" />
                  <Button
                    disabled={!data.expenses.length}
                    onClick={() => {
                      downloadCsv(
                        "atmos-expenses.csv",
                        data.expenses
                          .filter((e) => scoped(e.property_id))
                          .map((e) => ({
                            merchant: e.merchant,
                            amount_usd: (e.amount_cents / 100).toFixed(2),
                            property: propertyName(e.property_id),
                            date: e.expense_date,
                            category: e.category,
                            memo: e.memo,
                            data_kind:
                              w.mode === "demo"
                                ? "fictional_demo"
                                : "operational",
                          })),
                      );
                      notify("Expense export downloaded");
                    }}
                  >
                    <Download size={15} /> Export
                  </Button>
                </div>
                <DataTable<Expense>
                  data={data.expenses.filter(
                    (e) =>
                      scoped(e.property_id) &&
                      e.merchant.toLowerCase().includes(search.toLowerCase()),
                  )}
                  columns={[
                    {
                      accessorKey: "merchant",
                      header: "Merchant",
                      cell: ({ row }) => (
                        <Merchant
                          name={row.original.merchant}
                          sub={row.original.memo}
                        />
                      ),
                    },
                    {
                      accessorKey: "amount_cents",
                      header: "Amount",
                      cell: ({ row }) => (
                        <strong>{money(row.original.amount_cents)}</strong>
                      ),
                    },
                    {
                      accessorKey: "expense_date",
                      header: "Date",
                      cell: ({ row }) => displayDate(row.original.expense_date),
                    },
                    { accessorKey: "category", header: "Category" },
                    {
                      accessorKey: "property_id",
                      header: "Property",
                      cell: ({ row }) => propertyName(row.original.property_id),
                    },
                  ]}
                  label="Expenses"
                />
              </>
            )}
            {section === "properties" && (
              <>
                <div className="toolbar">
                  <SearchField
                    value={search}
                    onChange={setSearch}
                    placeholder="Search properties or cities…"
                  />
                  <div className="toolbar-spacer" />
                  <span className="muted">
                    {data.properties.length} properties in your portfolio
                  </span>
                </div>
                <div className="property-grid">
                  {data.properties
                    .filter(
                      (p) =>
                        scoped(p.id) &&
                        `${p.name} ${p.city}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    )
                    .map((p, i) => (
                      <button
                        key={p.id}
                        className="property-card"
                        onClick={() =>
                          setDetail({ kind: "property", id: p.id })
                        }
                      >
                        <div
                          className={cx(
                            "property-art",
                            `property-art-${i % 4}`,
                          )}
                        >
                          <Building2 size={44} strokeWidth={1} />
                          <span>{p.city.toUpperCase()}</span>
                          <div className="building-shape" />
                        </div>
                        <div className="property-card-body">
                          <div>
                            <h3>{p.name}</h3>
                            <ChevronRight size={17} />
                          </div>
                          <p>
                            {p.city}, {p.state} <span>·</span> {p.rooms ?? "—"}{" "}
                            rooms
                          </p>
                          <div className="property-card-bottom">
                            <span>
                              Open bills
                              <strong>
                                {
                                  data.bills.filter(
                                    (b) =>
                                      b.property_id === p.id &&
                                      b.status !== "approved",
                                  ).length
                                }
                              </strong>
                            </span>
                            <span>
                              Card spend
                              <strong>
                                {money(
                                  data.transactions
                                    .filter(
                                      (t) =>
                                        t.property_id === p.id &&
                                        t.status !== "declined",
                                    )
                                    .reduce((s, t) => s + t.amount_cents, 0),
                                )}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
                {!data.properties.length && (
                  <Empty
                    title="Add your first property"
                    description="Your operational portfolio is separate from the research directory."
                    action={
                      <Button onClick={() => setModal("property")}>
                        Add property
                      </Button>
                    }
                  />
                )}
              </>
            )}
            {section === "analytics" && (
              <Analytics
                transactions={transactions}
                bills={bills}
                demo={w.mode === "demo"}
              />
            )}
            {section === "cards" &&
              (w.mode === "live" ? (
                unavailable("Corporate cards")
              ) : (
                <>
                  <div className="section-callout">
                    <ShieldCheck size={18} />
                    <span>
                      Demo cards let you explore controls. No cards are issued
                      and no funds can be spent.
                    </span>
                  </div>
                  <div className="cards-grid">
                    {data.cards
                      .filter((c) => scoped(c.property_id))
                      .map((card, i) => (
                        <div className="card-tile" key={card.id}>
                          <div
                            className={cx(
                              "physical-card",
                              card.status === "frozen" && "frozen",
                            )}
                          >
                            <div>
                              <strong>ΛTMOS</strong>
                              <span>{card.type}</span>
                            </div>
                            <div className="card-chip" />
                            <div className="card-number">
                              •••• &nbsp; •••• &nbsp; •••• &nbsp; {card.last4}
                            </div>
                            <footer>
                              <span>{card.holder.toUpperCase()}</span>
                              <span className="card-network">visa</span>
                            </footer>
                          </div>
                          <div className="card-tile-title">
                            <div>
                              <h3>{card.name}</h3>
                              <p>{propertyName(card.property_id)}</p>
                            </div>
                            <Status status={card.status} />
                          </div>
                          <div className="kv">
                            <span>Monthly demo limit</span>
                            <strong>{shortMoney(card.limit_cents)}</strong>
                          </div>
                          <Button
                            className="full-width"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  w.mutate(
                                    "cards",
                                    {
                                      status:
                                        card.status === "active"
                                          ? "frozen"
                                          : "active",
                                    },
                                    card.id,
                                  ),
                                card.status === "active"
                                  ? "Demo card frozen"
                                  : "Demo card unfrozen",
                              )
                            }
                          >
                            <Lock size={14} />
                            {card.status === "active"
                              ? "Freeze demo card"
                              : "Unfreeze demo card"}
                          </Button>
                        </div>
                      ))}
                  </div>
                </>
              ))}
            {section === "statements" &&
              (w.mode === "live" ? (
                unavailable("Card statements")
              ) : (
                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Monthly statements</h2>
                      <p>Download the underlying transaction records as CSV.</p>
                    </div>
                    <Badge>Demo</Badge>
                  </div>
                  {["2026-11", "2026-10"].map((month) => {
                    const list = transactions.filter((t) =>
                      t.date.startsWith(month),
                    );
                    return (
                      <div className="statement-row" key={month}>
                        <span className="document-icon">
                          <FileText size={24} />
                        </span>
                        <div>
                          <strong>
                            {month === "2026-11" ? "November" : "October"} 2026
                          </strong>
                          <p>
                            {list.length} transactions ·{" "}
                            {money(
                              list
                                .filter((t) => t.status !== "declined")
                                .reduce((s, t) => s + t.amount_cents, 0),
                            )}
                          </p>
                        </div>
                        <Badge tone={month === "2026-11" ? "amber" : "green"}>
                          {month === "2026-11"
                            ? "In progress"
                            : "Closed demo period"}
                        </Badge>
                        <Button
                          onClick={() => {
                            downloadCsv(
                              `atmos-statement-${month}.csv`,
                              list.map((t) => ({
                                merchant: t.merchant,
                                date: t.date,
                                amount_usd: (t.amount_cents / 100).toFixed(2),
                                status: t.status,
                                property: propertyName(t.property_id),
                                data_kind: "fictional_demo",
                              })),
                            );
                            notify("Statement CSV downloaded");
                          }}
                        >
                          <Download size={15} /> Download CSV
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ))}
            {section === "policies" &&
              (w.mode === "live" ? (
                unavailable("Card policy enforcement")
              ) : (
                <div className="settings-grid">
                  <div className="panel settings-panel">
                    <h2>Receipt requirements</h2>
                    <p>
                      Preview your group’s spending policy. These demo
                      preferences do not enforce provider controls.
                    </p>
                    <div className="setting-row">
                      <div>
                        <strong>Require receipts</strong>
                        <p>Keep a record of business purchases.</p>
                      </div>
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label="Require receipts"
                        checked={policy.receipts}
                        onChange={(e) =>
                          setPolicy({ ...policy, receipts: e.target.checked })
                        }
                      />
                    </div>
                    <Field label="Receipt threshold (USD)">
                      <input
                        value={policy.threshold}
                        type="number"
                        min="0"
                        onChange={(e) =>
                          setPolicy({ ...policy, threshold: e.target.value })
                        }
                      />
                    </Field>
                    <Button
                      variant="primary"
                      onClick={() => {
                        try {
                          localStorage.setItem(
                            "atmos.demo.policy",
                            JSON.stringify(policy),
                          );
                          notify("Demo policy preferences saved");
                        } catch {
                          notify("Could not save preferences");
                        }
                      }}
                    >
                      Save demo policy
                    </Button>
                  </div>
                  <div className="panel settings-panel">
                    <ShieldCheck size={27} />
                    <h2>Built for accountability</h2>
                    <p>
                      For live card controls, connect an issuing provider and
                      map these rules to its authorization controls.
                    </p>
                    <div className="integration-status">
                      <span>Issuing provider</span>
                      <Badge>Not connected</Badge>
                    </div>
                  </div>
                </div>
              ))}
            {section === "payments" && (
              <>
                <div className="section-callout">
                  <Lock size={18} />
                  <span>
                    Payment execution is not connected. Approvals and exports
                    work; no money moves from this workspace.
                  </span>
                </div>
                <div className="stats-row">
                  <Stat
                    label="APPROVED FOR PAYMENT"
                    value={money(
                      bills
                        .filter((b) => b.status === "approved")
                        .reduce((s, b) => s + b.amount_cents, 0),
                    )}
                    detail={`${bills.filter((b) => b.status === "approved").length} approved bills`}
                  />
                  <Stat
                    label="PROCESSING"
                    value="$0.00"
                    detail="Payment provider not connected"
                  />
                  <Stat
                    label="PAYMENT STATUS"
                    value="Not connected"
                    detail="No real payment requests are sent"
                  />
                </div>
                <div className="section-heading">
                  <h2>Payment preparation</h2>
                  <Button
                    disabled={!bills.some((b) => b.status === "approved")}
                    onClick={() => {
                      downloadCsv(
                        "atmos-approved-payment-queue.csv",
                        bills
                          .filter((b) => b.status === "approved")
                          .map((b) => ({
                            invoice: b.number,
                            vendor: vendorName(b.vendor_id),
                            amount_usd: (b.amount_cents / 100).toFixed(2),
                            due: b.due_date,
                            status: "approved_not_paid",
                            data_kind:
                              w.mode === "demo"
                                ? "fictional_demo"
                                : "operational",
                          })),
                      );
                      notify("Payment preparation CSV downloaded");
                    }}
                  >
                    <Download size={15} /> Export approved bills
                  </Button>
                </div>
                <DataTable
                  data={bills.filter((b) => b.status === "approved")}
                  columns={billColumns.filter((c) => c.id !== "selection")}
                  onRow={(b) => setDetail({ kind: "bill", id: b.id })}
                  label="Approved bills"
                />
              </>
            )}
            {section === "accounting" && (
              <>
                <div className="settings-grid">
                  <div className="panel settings-panel">
                    <span className="feature-icon">
                      <BookOpen size={25} />
                    </span>
                    <h2>Ready for reconciliation</h2>
                    <p>
                      Export bill and expense records for your accounting
                      workflow. Approval records preserve who acted and when.
                    </p>
                    <div className="export-actions">
                      <Button onClick={exportBills} disabled={!bills.length}>
                        <Download size={15} /> Export bills
                      </Button>
                      <Button
                        onClick={() => {
                          downloadCsv(
                            "atmos-activity.csv",
                            data.activity.map((a) => ({
                              action: a.action,
                              entity: a.entity_type,
                              record: a.entity_id,
                              date: a.created_at,
                            })),
                          );
                          notify("Audit history exported");
                        }}
                        disabled={!data.activity.length}
                      >
                        <Download size={15} /> Export activity
                      </Button>
                    </div>
                  </div>
                  <div className="panel settings-panel">
                    <h2>Accounting integrations</h2>
                    <p>
                      Connectors can be added without changing your approval
                      workflow.
                    </p>
                    {["QuickBooks Online", "Xero", "Sage Intacct"].map(
                      (name) => (
                        <div className="integration-status" key={name}>
                          <strong>{name}</strong>
                          <Badge>Not connected</Badge>
                        </div>
                      ),
                    )}
                  </div>
                </div>
                <ActivityList activity={data.activity} />
              </>
            )}
            {section === "credit" &&
              (w.mode === "live" ? (
                unavailable("Credit facilities")
              ) : (
                <>
                  <div className="section-callout">
                    <AlertCircle size={18} />
                    <span>
                      Illustrative demo figures only. This is not a credit offer
                      or an active facility.
                    </span>
                  </div>
                  <div className="stats-row">
                    <Stat
                      label="DEMO CARD LIMIT"
                      value={shortMoney(cardLimit)}
                      detail="Illustrative portfolio capacity"
                    />
                    <Stat
                      label="CURRENT DEMO BALANCE"
                      value={money(spend)}
                      detail={`${money(pending)} pending`}
                    />
                    <Stat
                      label="AVAILABLE DEMO CREDIT"
                      value={shortMoney(Math.max(0, cardLimit - spend))}
                      detail="Not available for real spending"
                    />
                  </div>
                  <div className="panel settings-panel">
                    <h2>Portfolio utilization</h2>
                    <div className="large-utilization">
                      {((spend / Math.max(cardLimit, 1)) * 100).toFixed(1)}
                      <span>%</span>
                    </div>
                    <div className="credit-track">
                      <span
                        style={{
                          width: `${Math.min((spend / Math.max(cardLimit, 1)) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <p>
                      Calculated from the currently selected demo properties.
                    </p>
                    <Link href="/card/analytics/" className="text-link">
                      Explore spending <ArrowRight size={15} />
                    </Link>
                  </div>
                </>
              ))}
            {section === "team" && (
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      {w.mode === "demo" ? "Hotelify team" : "Workspace access"}
                    </h2>
                    <p>
                      {w.mode === "demo"
                        ? "Fictional people shown for demonstration."
                        : "Your current access is enforced by organization membership."}
                    </p>
                  </div>
                  <Badge>{w.mode === "demo" ? "Demo" : w.role}</Badge>
                </div>
                {w.mode === "demo" ? (
                  <DataTable
                    data={data.cards.map((c, i) => ({
                      id: c.id,
                      name: c.holder,
                      property: propertyName(c.property_id),
                      role: i === 0 ? "Administrator" : "Property manager",
                    }))}
                    columns={[
                      {
                        accessorKey: "name",
                        header: "Team member",
                        cell: ({ row }) => (
                          <div className="person">
                            <span className="avatar">
                              {initials(row.original.name)}
                            </span>
                            <strong>{row.original.name}</strong>
                          </div>
                        ),
                      },
                      { accessorKey: "property", header: "Property" },
                      { accessorKey: "role", header: "Role" },
                    ]}
                    label="Team members"
                  />
                ) : (
                  <div className="settings-panel">
                    <KV name="Signed in as" value={w.session?.user.email} />
                    <KV name="Organization" value={w.org?.name} />
                    <KV name="Your role" value={w.role} />
                    <p>
                      Additional members can be provisioned by your organization
                      owner in Supabase. Invitations and email delivery are not
                      configured yet.
                    </p>
                  </div>
                )}
              </div>
            )}
            {section === "settings" && (
              <div className="settings-grid">
                <div className="panel settings-panel">
                  <h2>Workspace</h2>
                  <p>
                    Choose between a fictional demo and your organization’s
                    operational data.
                  </p>
                  <KV
                    name="Mode"
                    value={
                      <Badge tone={w.mode === "demo" ? "amber" : "green"}>
                        {w.mode === "demo" ? "Hotelify demo" : "Live workspace"}
                      </Badge>
                    }
                  />
                  <KV
                    name="Organization"
                    value={w.mode === "demo" ? "Hotelify Group" : w.org?.name}
                  />
                  <KV name="Currency" value="USD" />
                  <KV
                    name="Data storage"
                    value={
                      w.mode === "demo"
                        ? "This browser only"
                        : "Supabase PostgreSQL"
                    }
                  />
                  <Button onClick={() => setModal("workspace")}>
                    Manage workspace <ArrowRight size={15} />
                  </Button>
                  {w.mode === "demo" && (
                    <Button variant="ghost" onClick={() => setModal("reset")}>
                      Reset demo data
                    </Button>
                  )}
                </div>
                <div className="panel settings-panel">
                  <h2>Connections</h2>
                  <p>Your data and payment services.</p>
                  <div className="integration-status">
                    <strong>Supabase</strong>
                    <Badge tone={w.session ? "green" : "neutral"}>
                      {w.session ? "Signed in" : "Sign in required"}
                    </Badge>
                  </div>
                  <div className="integration-status">
                    <strong>Stripe</strong>
                    <Badge>Not connected</Badge>
                  </div>
                  <div className="integration-status">
                    <strong>Bank accounts</strong>
                    <Badge>Not connected</Badge>
                  </div>
                  <div className="integration-status">
                    <strong>Research datasets</strong>
                    <Badge>Kept separate</Badge>
                  </div>
                </div>
                <div className="panel settings-panel">
                  <h2>About this workspace</h2>
                  <p>
                    Atmos brings your hotel group’s spending and approval
                    workflows together. Research datasets remain private and are
                    never used as transactional records.
                  </p>
                  <Button onClick={() => setModal("help")}>
                    <HelpCircle size={15} /> How this version works
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        <footer className="page-footer">
          <span>
            ΛTMOS <i /> A clearer view of your hotel finances.
          </span>
          <span>
            <ShieldCheck size={12} />
            {w.mode === "demo"
              ? "Fictional demo · No money movement"
              : "Organization-scoped access"}
          </span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      <Modal
        open={["bill", "vendor", "property", "expense", "auth"].includes(modal)}
        onClose={() => setModal("")}
        title={
          {
            bill: "Create a bill",
            vendor: "Add a vendor",
            property: "Add a property",
            expense: "Record an expense",
            auth: "Welcome to Atmos",
          }[modal] ?? ""
        }
        description={
          modal === "auth"
            ? "Your secure hotel finance workspace."
            : w.mode === "demo"
              ? "This record will be saved in your fictional demo."
              : "This record will be saved to your organization."
        }
      >
        {modal === "bill" ? (
          <BillForm w={w} done={() => setModal("")} />
        ) : modal === "vendor" ? (
          <VendorForm w={w} done={() => setModal("")} />
        ) : modal === "property" ? (
          <PropertyForm w={w} done={() => setModal("")} />
        ) : modal === "expense" ? (
          <ExpenseForm w={w} done={() => setModal("")} />
        ) : modal === "auth" ? (
          <AuthForm
            done={() => {
              w.setMode("live");
              finish("Signed in to your live workspace");
            }}
          />
        ) : null}
      </Modal>
      <Modal
        open={modal === "workspace"}
        onClose={() => setModal("")}
        title="Your workspace"
        description="Demo and operational data are kept completely separate."
      >
        <div className="workspace-options">
          <button
            onClick={() => {
              w.setMode("demo");
              setModal("");
            }}
          >
            <span className="brand-mark">H</span>
            <div>
              <strong>Hotelify Group</strong>
              <p>Fictional demo · saved in this browser</p>
            </div>
            {w.mode === "demo" && <Check size={18} />}
          </button>
          <button
            onClick={() => {
              w.setMode("live");
              setModal(w.session ? "" : "auth");
            }}
          >
            <span className="workspace-live-icon">
              <Building2 size={21} />
            </span>
            <div>
              <strong>{w.org?.name ?? "Your live workspace"}</strong>
              <p>
                {w.session
                  ? w.session.user.email
                  : "Sign in to create or access your organization"}
              </p>
            </div>
            {w.mode === "live" && <Check size={18} />}
          </button>
        </div>
        {w.session && (
          <div className="form-footer">
            <Button
              onClick={() =>
                void run(async () => {
                  const result = await supabase!.auth.signOut();
                  if (result.error) throw result.error;
                  w.setMode("demo");
                  setModal("");
                }, "Signed out")
              }
            >
              <LogOut size={15} /> Sign out
            </Button>
          </div>
        )}
      </Modal>
      <Modal
        open={modal === "reset"}
        onClose={() => setModal("")}
        title="Reset Hotelify demo?"
        description="This replaces saved demo edits on this browser with the original fictional records. Live workspace data is unaffected."
      >
        <div className="form-footer">
          <Button onClick={() => setModal("")}>Keep changes</Button>
          <Button
            variant="danger"
            onClick={() => {
              try {
                w.resetDemo();
                finish("Demo reset");
              } catch (e) {
                notify(errorMessage(e));
              }
            }}
          >
            Reset demo
          </Button>
        </div>
      </Modal>
      <Modal
        open={modal === "search"}
        onClose={() => {
          setModal("");
          setCommand("");
        }}
        title="Find your way"
        description="Search dashboard pages and vendors."
      >
        <div className="command-search">
          <SearchField
            value={command}
            onChange={setCommand}
            placeholder="Search pages or vendors…"
          />
          <div className="command-results">
            {[
              ...navigation.flatMap((n) =>
                n.children ? n.children : [[n.name, n.path]],
              ),
              ...lowerNav.map((n) => [n.name, n.path]),
            ]
              .filter(([name]) =>
                name.toLowerCase().includes(command.toLowerCase()),
              )
              .map(([name, href]) => (
                <button
                  key={href}
                  onClick={() => {
                    router.push(href);
                    setModal("");
                    setCommand("");
                  }}
                >
                  <span>{name}</span>
                  <ArrowRight size={15} />
                </button>
              ))}
            {command &&
              data.vendors
                .filter((v) =>
                  v.name.toLowerCase().includes(command.toLowerCase()),
                )
                .slice(0, 5)
                .map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setDetail({ kind: "vendor", id: v.id });
                      setModal("");
                    }}
                  >
                    <span>
                      {v.name} <small>Vendor</small>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                ))}
          </div>
        </div>
      </Modal>
      <Modal
        open={modal === "activity"}
        onClose={() => setModal("")}
        title="Workspace activity"
        description="A history of changes in your current workspace."
        wide
      >
        <ActivityList activity={data.activity} />
      </Modal>
      <Modal
        open={modal === "help"}
        onClose={() => setModal("")}
        title="A working foundation for Atmos"
        description="What you can do in this version."
      >
        <div className="help-content">
          <p>
            <CheckCircle2 size={17} /> Create properties, vendors, bills and
            expenses.
          </p>
          <p>
            <CheckCircle2 size={17} /> Submit, approve or reject bills and
            attach documents.
          </p>
          <p>
            <CheckCircle2 size={17} /> Filter records, explore analytics and
            export CSVs.
          </p>
          <p>
            <ShieldCheck size={17} /> Use a live, organization-scoped Supabase
            workspace.
          </p>
          <hr />
          <p>
            Card transactions, card controls and credit figures are available in
            Hotelify demo mode only. Stripe, bank connectivity, accounting sync
            and invitation emails are not connected. No action in this dashboard
            transfers real money.
          </p>
        </div>
      </Modal>
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={
          currentBill
            ? currentBill.number
            : currentTransaction
              ? currentTransaction.merchant
              : detail?.kind === "vendor"
                ? vendorName(detail.id)
                : detail?.kind === "property"
                  ? propertyName(detail.id)
                  : "Details"
        }
        description={
          currentBill
            ? "Bill details and approval history"
            : currentTransaction
              ? "Transaction details"
              : undefined
        }
      >
        {currentBill && (
          <>
            <div className="detail-hero">
              <Merchant
                name={vendorName(currentBill.vendor_id)}
                sub={currentBill.number}
              />
              <div className="detail-amount">
                {money(currentBill.amount_cents)}
              </div>
              <Status status={currentBill.status} />
            </div>
            <dl>
              <KV
                name="Property"
                value={propertyName(currentBill.property_id)}
              />
              <KV name="Due date" value={displayDate(currentBill.due_date)} />
              <KV name="Category" value={currentBill.category} />
              <KV name="Currency" value={currentBill.currency} />
              <KV name="Created" value={displayDate(currentBill.created_at)} />
            </dl>
            <div className="detail-section">
              <h3>Description</h3>
              <p>{currentBill.description || "No description added."}</p>
            </div>
            <div className="detail-section">
              <div className="section-heading">
                <h3>Documents</h3>
                <label className={cx("button", busy && "disabled-upload")}>
                  <Upload size={14} /> Attach
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    className="sr-only"
                    aria-label="Attach bill document"
                    disabled={busy || !w.canWrite}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void run(() => upload(file));
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {data.documents
                .filter((d) => d.bill_id === currentBill.id)
                .map((d) => (
                  <button
                    className="document-row"
                    key={d.id}
                    onClick={() => void run(() => openDocument(d.path))}
                  >
                    <FileText size={17} />
                    <span>{d.name}</span>
                    <ExternalLink size={14} />
                  </button>
                ))}
              {!data.documents.some((d) => d.bill_id === currentBill.id) && (
                <p className="muted">
                  No documents attached. PDF, JPG or PNG, up to 10 MB.
                </p>
              )}
            </div>
            <div className="detail-section">
              <h3>Activity</h3>
              {data.activity
                .filter((a) => a.entity_id === currentBill.id)
                .slice(0, 6)
                .map((a) => (
                  <div className="detail-activity" key={a.id}>
                    <span className="save-dot" />
                    <div>
                      {a.action}
                      <small>{displayDate(a.created_at)}</small>
                    </div>
                  </div>
                ))}
              <p className="tiny-note">
                Approved bills are ready for payment preparation. Approval does
                not transfer funds.
              </p>
            </div>
            <div className="drawer-actions">
              {currentBill.status === "draft" && (
                <Button
                  variant="primary"
                  disabled={busy || !w.canWrite}
                  onClick={() =>
                    void run(
                      () => w.transition(currentBill.id, "submitted"),
                      "Bill submitted for approval",
                    )
                  }
                >
                  Submit for approval <ArrowRight size={15} />
                </Button>
              )}
              {currentBill.status === "submitted" && (
                <>
                  <Button
                    variant="danger"
                    disabled={busy || !w.canApprove}
                    onClick={() =>
                      void run(
                        () => w.transition(currentBill.id, "rejected"),
                        "Bill rejected",
                      )
                    }
                  >
                    Reject
                  </Button>
                  <Button
                    variant="primary"
                    disabled={busy || !w.canApprove}
                    onClick={() =>
                      void run(
                        () => w.transition(currentBill.id, "approved"),
                        "Bill approved",
                      )
                    }
                  >
                    <Check size={15} /> Approve bill
                  </Button>
                </>
              )}
              {currentBill.status === "rejected" && (
                <Button
                  disabled={busy || !w.canWrite}
                  onClick={() =>
                    void run(
                      () => w.transition(currentBill.id, "draft"),
                      "Bill returned to draft",
                    )
                  }
                >
                  Return to draft
                </Button>
              )}
              {currentBill.status === "approved" && (
                <Badge tone="green">Approved · not paid</Badge>
              )}
            </div>
          </>
        )}
        {currentTransaction && (
          <>
            <div className="detail-hero">
              <span className="merchant-logo mint">
                {initials(currentTransaction.merchant)}
              </span>
              <div className="detail-amount">
                {money(currentTransaction.amount_cents)}
              </div>
              <Status status={currentTransaction.status} />
            </div>
            <dl>
              <KV name="Date" value={displayDate(currentTransaction.date)} />
              <KV
                name="Property"
                value={propertyName(currentTransaction.property_id)}
              />
              <KV name="Cardholder" value={currentTransaction.cardholder} />
              <KV
                name="Card"
                value={`•••• ${data.cards.find((c) => c.id === currentTransaction.card_id)?.last4}`}
              />
              <KV name="Department" value={currentTransaction.category} />
              <KV name="MCC" value={currentTransaction.mcc} />
            </dl>
            <div className="detail-section">
              <h3>Memo</h3>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={3}
                placeholder="Add a note about this purchase"
              />
              <Button
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      w.mutate("transactions", { memo }, currentTransaction.id),
                    "Demo memo saved",
                  )
                }
              >
                Save memo
              </Button>
            </div>
            <div className="detail-section">
              <h3>Receipt tracking</h3>
              <p>
                {currentTransaction.receipt
                  ? "A receipt is marked as provided in this demo."
                  : "This demo transaction is missing a receipt."}
              </p>
              <Button
                onClick={() =>
                  void run(
                    () =>
                      w.mutate(
                        "transactions",
                        { receipt: !currentTransaction.receipt },
                        currentTransaction.id,
                      ),
                    "Demo receipt status updated",
                  )
                }
                disabled={busy}
              >
                <Paperclip size={15} />
                {currentTransaction.receipt
                  ? "Mark missing (demo)"
                  : "Mark provided (demo)"}
              </Button>
            </div>
            <div className="section-callout small">
              <AlertCircle size={16} /> Fictional transaction. No actual receipt
              or charge is represented.
            </div>
          </>
        )}
        {detail?.kind === "vendor" &&
          (() => {
            const vendor = data.vendors.find((v) => v.id === detail.id);
            return vendor ? (
              <>
                <div className="detail-hero">
                  <Merchant name={vendor.name} sub={vendor.category} />
                </div>
                <dl>
                  <KV
                    name="Contact email"
                    value={vendor.email || "Not provided"}
                  />
                  <KV name="Category" value={vendor.category} />
                  <KV
                    name="Total bills"
                    value={
                      data.bills.filter((b) => b.vendor_id === vendor.id).length
                    }
                  />
                </dl>
                <h3 className="detail-subheading">Recent bills</h3>
                {data.bills
                  .filter((b) => b.vendor_id === vendor.id)
                  .map((b) => (
                    <button
                      key={b.id}
                      className="document-row"
                      onClick={() => setDetail({ kind: "bill", id: b.id })}
                    >
                      <FileText size={17} />
                      <span>
                        {b.number}
                        <small>{displayDate(b.due_date)}</small>
                      </span>
                      <strong>{money(b.amount_cents)}</strong>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                <Button
                  className="full-width"
                  onClick={() => {
                    setDetail(null);
                    setModal("bill");
                  }}
                  disabled={!w.canWrite}
                >
                  Create a bill
                </Button>
              </>
            ) : null;
          })()}
        {detail?.kind === "property" &&
          (() => {
            const p = data.properties.find((p) => p.id === detail.id);
            return p ? (
              <>
                <div className="property-detail-art">
                  <Building2 size={64} strokeWidth={1} />
                </div>
                <dl>
                  <KV name="Location" value={`${p.city}, ${p.state}`} />
                  <KV name="Rooms" value={p.rooms ?? "Not provided"} />
                  <KV
                    name="Open bills"
                    value={
                      data.bills.filter(
                        (b) =>
                          b.property_id === p.id && b.status !== "approved",
                      ).length
                    }
                  />
                  <KV
                    name="Total recorded bills"
                    value={money(
                      data.bills
                        .filter((b) => b.property_id === p.id)
                        .reduce((s, b) => s + b.amount_cents, 0),
                    )}
                  />
                </dl>
                <Button
                  variant="primary"
                  className="full-width"
                  onClick={() => {
                    setScope(p.id);
                    setDetail(null);
                    router.push("/billpay/approvals/");
                  }}
                >
                  View property bills <ArrowRight size={15} />
                </Button>
              </>
            ) : null;
          })()}
      </Drawer>
    </div>
  );
}

function ActivityList({ activity }: { activity: Activity[] }) {
  return (
    <div className="activity-panel">
      <div className="section-heading">
        <h2>Activity history</h2>
        <span className="muted">
          Latest {Math.min(activity.length, 20)} events
        </span>
      </div>
      {!activity.length ? (
        <Empty
          title="Your activity will appear here"
          description="Create or update a record to start your audit history."
        />
      ) : (
        activity.slice(0, 20).map((a) => (
          <div className="activity-row" key={a.id}>
            <span className="activity-icon">
              <FileCheck size={17} />
            </span>
            <div>
              <strong>{a.action}</strong>
              <p>
                {a.entity_type.replace("atmos_", "").replaceAll("_", " ")} ·{" "}
                {displayDate(a.created_at)}
              </p>
            </div>
            <span className="muted">
              {new Date(a.created_at).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
function Analytics({
  transactions,
  bills,
  demo,
}: {
  transactions: Transaction[];
  bills: Bill[];
  demo: boolean;
}) {
  const records = demo
    ? transactions
        .filter((t) => t.status !== "declined")
        .map((t) => ({
          amount: t.amount_cents,
          category: t.category,
          date: t.date,
        }))
    : bills.map((b) => ({
        amount: b.amount_cents,
        category: b.category,
        date: b.created_at.slice(0, 10),
      }));
  const total = records.reduce((s, r) => s + r.amount, 0);
  const groups = categories
    .map((category) => ({
      category,
      value: records
        .filter((r) => r.category === category)
        .reduce((s, r) => s + r.amount, 0),
    }))
    .filter((g) => g.value)
    .sort((a, b) => b.value - a.value);
  const dates = Array.from(new Set(records.map((r) => r.date))).sort();
  const chart = dates.map((date) => ({
    date: date.slice(5),
    amount:
      records.filter((r) => r.date === date).reduce((s, r) => s + r.amount, 0) /
      100,
  }));
  return (
    <>
      <div className="stats-row">
        <Stat
          label={demo ? "TOTAL CARD SPEND" : "TOTAL BILLED"}
          value={money(total)}
          detail={
            demo
              ? "Excludes declined demo transactions"
              : "All recorded bill statuses"
          }
        />
        <Stat
          label="RECORDS"
          value={String(records.length)}
          detail="Across the selected properties"
        />
        <Stat
          label="AVERAGE AMOUNT"
          value={money(records.length ? Math.round(total / records.length) : 0)}
          detail="Per recorded item"
        />
      </div>
      <div className="analytics-grid">
        <div className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>
                {demo ? "Spending over time" : "Bills recorded over time"}
              </h2>
              <p>Daily totals in USD</p>
            </div>
            <Badge>{demo ? "Demo" : "Live"}</Badge>
          </div>
          {chart.length ? (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={270}>
                <AreaChart
                  data={chart}
                  margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#698c7b"
                        stopOpacity={0.22}
                      />
                      <stop offset="100%" stopColor="#698c7b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#eceeea" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#8a8d87" }}
                    minTickGap={28}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#8a8d87" }}
                    tickFormatter={(v) => `$${v / 1000}k`}
                  />
                  <Tooltip
                    formatter={(v) => money(Number(v) * 100)}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #e5e7e3",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#4f7863"
                    strokeWidth={2}
                    fill="url(#spendFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty
              title="Not enough data yet"
              description="Create your first bill to see recorded activity here."
            />
          )}
        </div>
        <div className="panel category-panel">
          <h2>By department</h2>
          <p>Where your spending is concentrated</p>
          {groups.map((g, i) => (
            <div className="category-row" key={g.category}>
              <div>
                <span>
                  <i
                    style={{
                      background: [
                        "#557765",
                        "#8faaa0",
                        "#b2c2a3",
                        "#d9bd93",
                        "#a9a3be",
                        "#d6c8ae",
                      ][i % 6],
                    }}
                  />
                  {g.category}
                </span>
                <strong>{shortMoney(g.value)}</strong>
              </div>
              <div className="category-track">
                <span style={{ width: `${(g.value / total) * 100}%` }} />
              </div>
            </div>
          ))}
          {!groups.length && (
            <p className="muted">No categories recorded yet.</p>
          )}
        </div>
      </div>
    </>
  );
}
