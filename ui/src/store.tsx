import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  activeContracts,
  listParties,
  login,
  logout,
  me,
  SignedOut,
  type Contract,
  type Session,
} from "./ledger";
import { ROLES, roleOf, type Role } from "./model";

type Toast = { id: number; kind: "ok" | "error"; text: string };

type Store = {
  status: "loading" | "signedout" | "ready" | "offline";
  session: Session | null;
  signIn: (username: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  parties: Partial<Record<Role, string>>;
  /** Snapshots per role. Only the signed-in party's, except for the judge view. */
  acs: Partial<Record<Role, Contract[]>>;
  /** Run a ledger command, report the outcome, refresh every view. */
  act: (label: string, fn: () => Promise<unknown>) => Promise<boolean>;
  busy: string | null;
  toasts: Toast[];
  hovered: string | null;
  setHovered: (cid: string | null) => void;
  /** Roles that are stakeholders of this contract, i.e. whose nodes hold it. */
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
  const [session, setSession] = useState<Session | null>(null);
  const [parties, setParties] = useState<Store["parties"]>({});
  const [acs, setAcs] = useState<Store["acs"]>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const toastId = useRef(0);

  const refresh = useCallback(async (who: Session | null) => {
    if (!who) return;
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
      const visible = who.role === "Judge" ? ROLES : ROLES.filter((r) => r === who.role);
      const roles = visible.filter((r) => byRole[r]);
      const snapshots = await Promise.all(roles.map((r) => activeContracts(byRole[r]!)));
      setParties(byRole);
      setAcs(Object.fromEntries(roles.map((r, i) => [r, snapshots[i]])));
      setStatus("ready");
    } catch (e) {
      if (e instanceof SignedOut) {
        setSession(null);
        setStatus("signedout");
      } else setStatus("offline");
    }
  }, []);

  useEffect(() => {
    me()
      .then((s) => setSession(s))
      .catch((e) => setStatus(e instanceof SignedOut ? "signedout" : "offline"));
  }, []);

  useEffect(() => {
    if (!session) return;
    refresh(session);
    const t = setInterval(() => refresh(session), POLL_MS);
    return () => clearInterval(t);
  }, [session, refresh]);

  const signIn = useCallback<Store["signIn"]>(async (username) => {
    try {
      setSession(await login(username));
      setStatus("loading");
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setSession(null);
    setAcs({});
    setStatus("signedout");
  }, []);

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
        await refresh(session);
      }
    },
    [pushToast, refresh, session],
  );

  // Stakeholders come with the contract, so this works even when only one
  // party's snapshot is loaded.
  const seenBy = useCallback(
    (cid: string) => {
      const c = Object.values(acs)
        .flat()
        .find((x) => x?.contractId === cid);
      if (!c) return [];
      const holders = new Set([...c.signatories, ...c.observers].map(roleOf));
      return ROLES.filter((r) => holders.has(r));
    },
    [acs],
  );

  const value = useMemo<Store>(
    () => ({ status, session, signIn, signOut, parties, acs, act, busy, toasts, hovered, setHovered, seenBy }),
    [status, session, signIn, signOut, parties, acs, act, busy, toasts, hovered, seenBy],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
