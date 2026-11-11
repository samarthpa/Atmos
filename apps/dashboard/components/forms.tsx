"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Field } from "./ui";
import { WorkspaceController } from "@/lib/workspace";
import { categories, parseCents } from "@/lib/model";
import { supabase } from "@/lib/supabase";
const nameSchema = z.string().trim().min(1, "Name is required").max(120);
const vendorSchema = z.object({
  name: nameSchema,
  email: z.union([z.email(), z.literal("")]),
  category: z.string().min(1),
});
export function VendorForm({
  w,
  done,
}: {
  w: WorkspaceController;
  done: () => void;
}) {
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(vendorSchema),
    defaultValues: { name: "", email: "", category: "Other" },
  });
  return (
    <form
      onSubmit={handleSubmit(async (v) => {
        try {
          await w.mutate("vendors", v);
          done();
        } catch (e) {
          setError(errorMessage(e));
        }
      })}
      className="form-stack"
    >
      <Field label="Vendor name">
        <input
          autoFocus
          {...register("name")}
          placeholder="e.g. Acme Hospitality Supply"
        />
      </Field>
      {errors.name && <p className="error-text">{errors.name.message}</p>}
      <Field label="Contact email">
        <input
          {...register("email")}
          type="email"
          placeholder="billing@example.com"
        />
      </Field>
      {errors.email && (
        <p className="error-text">Enter a valid email address.</p>
      )}
      <Field label="Category">
        <select {...register("category")}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="form-footer">
        <Button type="button" onClick={done}>
          Cancel
        </Button>
        <Button variant="primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Create vendor"}
        </Button>
      </div>
    </form>
  );
}
export function PropertyForm({
  w,
  done,
}: {
  w: WorkspaceController;
  done: () => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setSaving(true);
        try {
          await w.mutate("properties", {
            name: nameSchema.parse(f.get("name")),
            city: String(f.get("city") || "").trim(),
            state: String(f.get("state") || "").trim(),
            rooms: f.get("rooms") ? Number(f.get("rooms")) : null,
          });
          done();
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Property name">
        <input
          autoFocus
          name="name"
          required
          maxLength={120}
          placeholder="e.g. The Midtown Hotel"
        />
      </Field>
      <div className="form-grid">
        <Field label="City">
          <input name="city" required placeholder="New York" />
        </Field>
        <Field label="State / region">
          <input name="state" required placeholder="NY" maxLength={60} />
        </Field>
      </div>
      <Field label="Rooms">
        <input
          name="rooms"
          type="number"
          min="0"
          max="100000"
          step="1"
          placeholder="Optional"
        />
      </Field>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="form-footer">
        <Button type="button" onClick={done}>
          Cancel
        </Button>
        <Button variant="primary" disabled={saving}>
          {saving ? "Saving…" : "Create property"}
        </Button>
      </div>
    </form>
  );
}
export function BillForm({
  w,
  done,
}: {
  w: WorkspaceController;
  done: () => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  if (!w.data.vendors.length || !w.data.properties.length)
    return (
      <div className="form-stack">
        <p>Add at least one property and vendor before creating a bill.</p>
        <Button onClick={done}>Got it</Button>
      </div>
    );
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setSaving(true);
        try {
          const number = String(f.get("number")).trim();
          const vendor_id = String(f.get("vendor_id"));
          if (
            w.data.bills.some(
              (b) => b.vendor_id === vendor_id && b.number === number,
            )
          )
            throw Error(
              "A bill with this invoice number already exists for this vendor.",
            );
          await w.mutate("bills", {
            vendor_id,
            property_id: String(f.get("property_id")),
            number,
            amount_cents: parseCents(String(f.get("amount"))),
            currency: "USD",
            due_date: String(f.get("due_date")),
            category: String(f.get("category")),
            description: String(f.get("description")),
            status: "draft",
          });
          done();
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="form-grid">
        <Field label="Vendor">
          <select name="vendor_id" required>
            {w.data.vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Property">
          <select name="property_id" required>
            {w.data.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Invoice number">
          <input
            autoFocus
            name="number"
            required
            maxLength={80}
            placeholder="INV-2026-001"
          />
        </Field>
        <Field label="Amount (USD)">
          <input
            name="amount"
            required
            inputMode="decimal"
            placeholder="0.00"
          />
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Due date">
          <input name="due_date" type="date" required />
        </Field>
        <Field label="Category">
          <select name="category">
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description">
        <textarea
          name="description"
          rows={3}
          placeholder="What is this bill for?"
        />
      </Field>
      <p className="form-note">
        Saved as a draft. Submit it for approval when you’re ready. Documents
        can be attached from the bill details.
      </p>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="form-footer">
        <Button type="button" onClick={done}>
          Cancel
        </Button>
        <Button variant="primary" disabled={saving}>
          {saving ? "Saving…" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}
export function ExpenseForm({
  w,
  done,
}: {
  w: WorkspaceController;
  done: () => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        const f = new FormData(e.currentTarget);
        try {
          await w.mutate("expenses", {
            merchant: nameSchema.parse(f.get("merchant")),
            property_id: String(f.get("property_id")),
            amount_cents: parseCents(String(f.get("amount"))),
            category: String(f.get("category")),
            expense_date: String(f.get("date")),
            memo: String(f.get("memo")),
          });
          done();
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Merchant">
        <input name="merchant" required autoFocus placeholder="Merchant name" />
      </Field>
      <div className="form-grid">
        <Field label="Amount (USD)">
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="0.00"
          />
        </Field>
        <Field label="Date">
          <input name="date" type="date" required />
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Property">
          <select name="property_id" required>
            {w.data.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select name="category">
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Memo">
        <textarea name="memo" rows={2} />
      </Field>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="form-footer">
        <Button onClick={done} type="button">
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={saving || !w.data.properties.length}
        >
          {saving ? "Saving…" : "Save expense"}
        </Button>
      </div>
    </form>
  );
}
export function AuthForm({ done }: { done: () => void }) {
  const [signup, setSignup] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!supabase) {
          setError("Supabase is not configured for this deployment.");
          return;
        }
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        setMessage("");
        try {
          const credentials = {
            email: String(f.get("email")),
            password: String(f.get("password")),
          };
          const result = signup
            ? await supabase.auth.signUp({
                ...credentials,
                options: {
                  emailRedirectTo: window.location.origin + "/settings/",
                },
              })
            : await supabase.auth.signInWithPassword(credentials);
          if (result.error) throw result.error;
          if (result.data.session) done();
          else
            setMessage(
              "Check your email to confirm your account, then return here to sign in.",
            );
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Sign in to save real operational records to your organization’s
        workspace. The Hotelify demo stays separate.
      </p>
      <Field label="Email">
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
      </Field>
      <Field label="Password">
        <input
          name="password"
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          required
          minLength={8}
        />
      </Field>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success-text" role="status">
          {message}
        </p>
      )}
      <Button variant="primary" disabled={busy}>
        {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setSignup(!signup);
          setError("");
          setMessage("");
        }}
      >
        {signup
          ? "Already have an account? Sign in"
          : "New to Atmos? Create an account"}
      </Button>
    </form>
  );
}
export function errorMessage(e: unknown) {
  return e instanceof Error
    ? e.message
    : String(
        (e as { message?: string })?.message ??
          "Something went wrong. Please try again.",
      );
}
