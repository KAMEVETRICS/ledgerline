import { useState, type ReactNode } from "react";
import { ROLE_INFO, type Role } from "./model";
import { useStore } from "./store";

/** A ledger contract. Hovering it lights up the same contract in every pane
 *  that can see it; the dots say whose node holds it. */
export function ContractCard({
  cid,
  title,
  aside,
  children,
}: {
  cid: string;
  title: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const { hovered, setHovered, seenBy } = useStore();
  const holders = seenBy(cid);
  return (
    <section
      className={`card${hovered === cid ? " linked" : ""}`}
      onMouseEnter={() => setHovered(cid)}
      onMouseLeave={() => setHovered(null)}
    >
      <header className="card-head">
        <h4>{title}</h4>
        {aside}
      </header>
      {children}
      <footer className="card-foot">
        <span className="muted">Held by</span>
        <HolderDots roles={holders} />
      </footer>
    </section>
  );
}

export function HolderDots({ roles }: { roles: Role[] }) {
  return (
    <span className="holders">
      {roles.map((r) => (
        <span key={r} className="holder" style={{ ["--c" as string]: ROLE_INFO[r].hue }} title={ROLE_INFO[r].name}>
          {shortRole(r)}
        </span>
      ))}
    </span>
  );
}

export const shortRole = (r: Role) =>
  ({ GP: "GP LL", GP2: "GP RW", GP3: "GP NW", Administrator: "Admin", LP_A: "LP A", LP_B: "LP B", LP_C: "LP C", Auditor: "Audit", Ecosystem: "Eco" })[r];

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="row">
      <span className="muted">{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <span style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Badge({ tone, children }: { tone: "good" | "bad" | "warn" | "neutral"; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="section">
      <div className="section-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function ActionButton({
  label,
  run,
  variant = "primary",
  disabled,
}: {
  label: string;
  run: () => Promise<unknown>;
  variant?: "primary" | "ghost";
  disabled?: boolean;
}) {
  const { busy } = useStore();
  return (
    <button className={`btn ${variant}`} disabled={disabled || busy !== null} onClick={() => run()}>
      {busy === label ? "Submitting…" : label}
    </button>
  );
}

/** Inline form that collapses to a single button until opened. */
export function InlineForm({
  open: openLabel,
  submit,
  children,
  onSubmit,
}: {
  open: string;
  submit: string;
  children: ReactNode;
  onSubmit: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const { busy } = useStore();
  if (!open)
    return (
      <button className="btn ghost" disabled={busy !== null} onClick={() => setOpen(true)}>
        {openLabel}
      </button>
    );
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onSubmit()) setOpen(false);
      }}
    >
      {children}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={busy !== null}>
          {busy ? "Submitting…" : submit}
        </button>
      </div>
    </form>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
