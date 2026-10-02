import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { activeContracts, listParties, type Contract } from "./ledger";
import { ROLES, roleOf, type Role } from "./model";

type Toast = { id: number; kind: "ok" | "error"; text: string };

type Store = {
  status: "loading" | "ready" | "offline";
  parties: Partial<Record<Role, string>>;
  acs: Partial<Record<Role, Contract[]>>;
  /** Run a ledger command, report the outcome, refresh every view. */
  act: (label: string, fn: () => Promise<unknown>) => Promise<boolean>;
  busy: string | null;
  toasts: Toast[];
  hovered: string | null;
  setHovered: (cid: string | null) => void;
  /** Roles whose participant holds this contract. */
  seenBy: (cid: string) => Role[];
};

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

const POLL_MS = 3000;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Store["status"]>("loading");
  const [parties, setParties] = useState<Store["parties"]>({});
  const [acs, setAcs] = useState<Store["acs"]>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const toastId = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const all = await listParties();
      const byRole: Store["parties"] = {};
      for (const p of all) {
        const r = roleOf(p);
        if (r) byRole[r] = p;
      }
      if (!byRole.GP) {
        setStatus("offline");
        return;
      }
      const roles = ROLES.filter((r) => byRole[r]);
      const snapshots = await Promise.all(roles.map((r) => activeContracts(byRole[r]!)));
      setParties(byRole);
      setAcs(Object.fromEntries(roles.map((r, i) => [r, snapshots[i]])));
      setStatus("ready");
    } catch {
      setStatus("offline");
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const pushToast = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts, { id, kind, text }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);

  const act = useCallback<Store["act"]>(
    async (label, fn) => {
      setBusy(label);
      try {
        await fn();
        pushToast("ok", label);
        return true;
      } catch (e) {
        pushToast("error", e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setBusy(null);
        await refresh();
      }
    },
    [pushToast, refresh],
  );

  const seenBy = useCallback(
    (cid: string) => ROLES.filter((r) => acs[r]?.some((c) => c.contractId === cid)),
    [acs],
  );

  const value = useMemo<Store>(
    () => ({ status, parties, acs, act, busy, toasts, hovered, setHovered, seenBy }),
    [status, parties, acs, act, busy, toasts, hovered, seenBy],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
