"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { demoWorkspace } from "./demo";
import { Workspace, emptyWorkspace, BillStatus, canTransition } from "./model";
const KEY = "atmos.hotelify.demo.v1";
const MODE_KEY = "atmos.workspace.mode.v1";
export function useWorkspace() {
  const requestVersion = useRef(0);
  const activeMode = useRef<"demo" | "live">("demo");
  const [data, setData] = useState<Workspace>(emptyWorkspace());
  const [mode, setModeState] = useState<"demo" | "live">("demo");
  const [session, setSession] = useState<Session | null>(null);
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const [role, setRole] = useState("owner");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadDemo = useCallback(() => {
    try {
      const stored = localStorage.getItem(KEY);
      const parsed = stored ? JSON.parse(stored) : null;
      if (
        parsed &&
        !Object.keys(emptyWorkspace()).every((k) => Array.isArray(parsed[k]))
      )
        throw Error("Invalid saved demo");
      setData(parsed ?? demoWorkspace());
    } catch {
      setData(demoWorkspace());
      setError("Saved demo could not be read. A fresh demo is shown.");
    }
    setOrg(null);
    setRole("owner");
    setReady(true);
  }, []);
  const setMode = (next: "demo" | "live") => {
    if (next === activeMode.current) return;
    activeMode.current = next;
    requestVersion.current++;
    setData(emptyWorkspace());
    setOrg(null);
    setReady(false);
    setBusy(false);
    setError("");
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {}
  };
  useEffect(() => {
    loadDemo();
    try {
      if (localStorage.getItem(MODE_KEY) === "live") {
        activeMode.current = "live";
        setModeState("live");
      }
    } catch {}
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) =>
      setSession(s),
    );
    return () => listener.subscription.unsubscribe();
  }, [loadDemo]);
  const refresh = useCallback(async () => {
    if (
      !supabase ||
      !session ||
      mode !== "live" ||
      activeMode.current !== "live"
    )
      return;
    const request = ++requestVersion.current;
    setBusy(true);
    setError("");
    try {
      const { data: orgs, error } = await supabase
        .from("atmos_organizations")
        .select("id,name,owner_id")
        .order("created_at")
        .limit(1);
      if (error) throw error;
      if (request !== requestVersion.current) return;
      const organization = orgs?.[0];
      if (!organization) {
        setOrg(null);
        setData(emptyWorkspace());
        return;
      }
      setOrg(organization);
      if (organization.owner_id === session.user.id) setRole("owner");
      else {
        const result = await supabase
          .from("atmos_members")
          .select("role")
          .eq("org_id", organization.id)
          .eq("user_id", session.user.id)
          .single();
        if (result.error) throw result.error;
        if (request !== requestVersion.current) return;
        setRole(result.data.role);
      }
      const tables = [
        "properties",
        "vendors",
        "bills",
        "expenses",
        "activity",
        "documents",
      ] as const;
      const responses = await Promise.all(
        tables.map((t) =>
          (async () => {
            const records: Record<string, unknown>[] = [];
            for (let offset = 0; ; offset += 1000) {
              const result = await supabase!
                .from(`atmos_${t}`)
                .select("*")
                .eq("org_id", organization.id)
                .order("created_at", { ascending: false })
                .order("id")
                .range(offset, offset + 999);
              if (result.error) return result;
              records.push(...result.data);
              if (result.data.length < 1000)
                return { data: records, error: null };
            }
          })(),
        ),
      );
      if (request !== requestVersion.current) return;
      const next = emptyWorkspace();
      responses.forEach((result, i) => {
        if (result.error) throw result.error;
        Object.assign(next, { [tables[i]]: result.data ?? [] });
      });
      setData(next);
    } catch (e) {
      if (request === requestVersion.current)
        setError(
          e instanceof Error
            ? e.message
            : String((e as { message?: string }).message ?? e),
        );
    } finally {
      if (request === requestVersion.current) {
        setBusy(false);
        setReady(true);
      }
    }
  }, [session, mode]);
  useEffect(() => {
    if (mode === "live") {
      if (session) void refresh();
      else {
        requestVersion.current++;
        setOrg(null);
        setData(emptyWorkspace());
        setBusy(false);
        setReady(true);
      }
    } else loadDemo();
  }, [mode, session, refresh, loadDemo]);
  const saveDemo = (next: Workspace) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setData(next);
    } catch {
      throw Error(
        "Could not save demo changes. Browser storage may be full or disabled.",
      );
    }
  };
  const mutate = async (
    collection: keyof Workspace,
    record: Record<string, unknown>,
    id?: string,
    expectedStatus?: string,
  ) => {
    setBusy(true);
    try {
      if (mode === "demo") {
        const saved = localStorage.getItem(KEY);
        const current: Workspace = saved ? JSON.parse(saved) : data;
        const item = {
          ...record,
          id: id ?? crypto.randomUUID(),
          created_at: record.created_at ?? new Date().toISOString(),
        };
        const list = current[collection] as unknown as Record<
          string,
          unknown
        >[];
        const next = {
          ...current,
          [collection]: id
            ? list.map((r) => (r.id === id ? { ...r, ...record } : r))
            : [item, ...list],
          activity: [
            {
              id: crypto.randomUUID(),
              action: `${id ? "Updated" : "Created"} ${collection}${record.status ? `: ${record.status}` : ""}`,
              entity_type: collection,
              entity_id: String(item.id),
              created_at: new Date().toISOString(),
            },
            ...current.activity,
          ],
        };
        saveDemo(next);
        return String(item.id);
      }
      if (!supabase || !org || !session)
        throw Error("Sign in and create a workspace first.");
      const table = `atmos_${collection}`;
      let query = id
        ? supabase.from(table).update(record).eq("id", id).eq("org_id", org.id)
        : supabase.from(table).insert({ ...record, org_id: org.id });
      if (id && expectedStatus) query = query.eq("status", expectedStatus);
      const { data: saved, error } = await query.select("id").single();
      if (error) throw error;
      await refresh();
      return saved.id as string;
    } finally {
      setBusy(false);
    }
  };
  const transition = async (id: string, status: BillStatus) => {
    const bill = data.bills.find((b) => b.id === id);
    if (!bill || !canTransition(bill.status, status))
      throw Error(
        "This bill cannot move to that status. Refresh and try again.",
      );
    await mutate("bills", { status }, id, bill.status);
  };
  const createOrg = async (name: string) => {
    if (!supabase || !session) throw Error("Sign in first");
    setBusy(true);
    try {
      const { error } = await supabase
        .from("atmos_organizations")
        .insert({ name, owner_id: session.user.id });
      if (error) throw error;
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const resetDemo = () => {
    saveDemo(demoWorkspace());
  };
  return {
    data,
    mode,
    setMode,
    session,
    org,
    role,
    ready,
    busy,
    error,
    setError,
    mutate,
    transition,
    refresh,
    createOrg,
    resetDemo,
    canWrite: role !== "viewer",
    canApprove: ["owner", "admin", "approver"].includes(role),
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
