import { useState, type ReactNode } from "react";
import {
  ActionButton,
  Badge,
  ContractCard,
  Empty,
  Field,
  InlineForm,
  Progress,
  Row,
  Section,
  Stat,
} from "./components";
import { create, exercise, type Contract } from "./ledger";
import {
  ROLE_INFO,
  TEMPLATE_LABELS,
  bps,
  byLp,
  cashFor,
  date,
  daysFromNow,
  fundHue,
  isLp,
  latestBy,
  money,
  moneyShort,
  multiple,
  num,
  of,
  partyName,
  pct,
  today,
  type AdminDesk,
  type AuditGrant,
  type AuditView,
  type CallNotice,
  type Cash,
  type Commitment,
  type ContributionReceipt,
  type DistributionReceipt,
  type Fund,
  type LpStatement,
  type MfnAttestation,
  type NavStatement,
  type Role,
} from "./model";
import { FundHealth, FundTrend, LpCashFlows, LpPerformance } from "./private/FundCharts";
import { useStore } from "./store";

const lpName = partyName;

export function Pane({ role }: { role: Role }) {
  const { parties, acs } = useStore();
  const party = parties[role];
  const contracts = acs[role] ?? [];
  const info = ROLE_INFO[role];
  const counts = new Map<string, number>();
  for (const c of contracts) counts.set(c.template, (counts.get(c.template) ?? 0) + 1);

  return (
    <article className="pane" style={{ ["--hue" as string]: info.hue }}>
      <header className="pane-head">
        <div>
          <span className="pane-kind">{info.kind}</span>
          <h2>{info.name}</h2>
          <code className="party" title={party}>
            {party ? `${party.split("::")[0]}::${party.split("::")[1]?.slice(0, 8)}…` : "not allocated"}
          </code>
        </div>
        <div className="pane-count" title="Active contracts on this party's participant">
          <strong>{contracts.length}</strong>
          <span>contracts</span>
        </div>
      </header>
      <div className="pane-body">
        {(role === "GP" || role === "GP2" || role === "GP3") && <GpView role={role} />}
        {role === "Administrator" && <AdminView />}
        {isLp(role) && <LpView role={role} />}
        {role === "Auditor" && <AuditorView />}
        {role === "Ecosystem" && <Empty>Network-wide statistics appear here once administrators publish them.</Empty>}
      </div>
      <footer className="pane-foot">
        <span className="muted">This node holds</span>
        <ul>
          {[...counts].map(([t, n]) => (
            <li key={t}>
              {TEMPLATE_LABELS[t] ?? t} <span className="num">×{n}</span>
            </li>
          ))}
          {counts.size === 0 && <li className="muted">nothing</li>}
        </ul>
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------- GP

function GpView({ role }: { role: Role }) {
  const { acs, parties, act } = useStore();
  const gp = parties[role]!;
  const mine = acs[role];
  const fund = of<Fund>(mine, "Fund:Fund")[0];
  const commitments = byLp(of<Commitment>(mine, "Fund:Commitment"));
  const notices = of<CallNotice>(mine, "Fund:CapitalCallNotice");
  const contributions = of<ContributionReceipt>(mine, "Fund:ContributionReceipt");
  const distributions = of<DistributionReceipt>(mine, "Fund:DistributionReceipt");
  const statements = of<LpStatement>(mine, "Reporting:LpStatement");
  const nav = latestBy(of<NavStatement>(mine, "Reporting:NavStatement"), (p) => p.asOf);
  const grant = of<AuditGrant>(mine, "Reporting:AuditGrant")[0];
  const cash = of<Cash>(mine, "Cash:Cash").filter((c) => c.payload.owner === gp);

  const [callAmount, setCallAmount] = useState("1000000");
  const [dueDate, setDueDate] = useState(daysFromNow(14).toISOString().slice(0, 10));
  const [purpose, setPurpose] = useState("Follow-on loans");
  const [distLp, setDistLp] = useState("");
  const [distAmount, setDistAmount] = useState("100000");

  if (!fund) return <Empty>No fund yet. Run the setup script.</Empty>;

  const committed = commitments.reduce((s, c) => s + num(c.payload.committed), 0);
  const contributed = commitments.reduce((s, c) => s + num(c.payload.contributed), 0);
  const distributed = commitments.reduce((s, c) => s + num(c.payload.distributed), 0);
  const callIds = [...new Set([...notices, ...contributions].map((c) => c.payload.callId))].sort();
  const nextCallId = `CC-${callIds.length + 1}`;
  const cashBalance = cash.reduce((s, c) => s + num(c.payload.amount), 0);

  return (
    <>
      <ContractCard cid={fund.contractId} title={fund.payload.name} aside={<Badge tone="neutral">{fund.payload.fundId}</Badge>}>
        <div className="stats">
          <Stat label="Committed" value={moneyShort(committed)} sub={`${commitments.length} LPs`} />
          <Stat label="Called" value={moneyShort(contributed)} sub={pct(committed ? contributed / committed : 0)} />
          <Stat label="Distributed" value={moneyShort(distributed)} />
          <Stat label="NAV" value={nav ? moneyShort(num(nav.payload.nav)) : "—"} sub={nav ? `as of ${date(nav.payload.asOf)}` : "not published"} />
        </div>
        <Progress value={committed ? contributed / committed : 0} label="Capital called" />
      </ContractCard>

      <Section title="Limited partners">
        <table className="table">
          <thead>
            <tr>
              <th>LP</th>
              <th className="r">Committed</th>
              <th className="r">Called</th>
              <th className="r">Fee</th>
              <th className="r">TVPI</th>
            </tr>
          </thead>
          <tbody>
            {commitments.map((c) => {
              const st = latestBy(statements.filter((s) => s.payload.lp === c.payload.lp), (p) => p.asOf);
              return (
                <LinkedRow key={c.contractId} cid={c.contractId}>
                  <td>
                    {lpName(c.payload.lp)}
                    {c.payload.terms.mostFavouredNation && <span className="tag">MFN</span>}
                  </td>
                  <td className="r num">{moneyShort(num(c.payload.committed))}</td>
                  <td className="r num">{pct(num(c.payload.contributed) / num(c.payload.committed))}</td>
                  <td className="r num">{bps(c.payload.terms.managementFeeBps)}</td>
                  <td className="r num">{st ? multiple(st.payload.tvpi) : "—"}</td>
                </LinkedRow>
              );
            })}
          </tbody>
        </table>
        <p className="hint">Side-letter terms differ per LP. Each LP sees only its own row.</p>
      </Section>

      <FundTrend mine={mine} fundId={fund.payload.fundId} />

      <Section
        title="Capital calls"
        action={
          <InlineForm
            open={`Issue ${nextCallId}`}
            submit={`Issue ${nextCallId}`}
            onSubmit={() =>
              act(`Capital call ${nextCallId} issued`, () =>
                exercise(gp, "Fund:Fund", fund.contractId, "IssueCapitalCall", {
                  callId: nextCallId,
                  totalAmount: callAmount,
                  issuedOn: today(),
                  dueDate,
                  purpose,
                  commitmentCids: commitments.map((c) => c.contractId),
                }),
              )
            }
          >
            <Field label="Total amount (USD)">
              <input inputMode="decimal" value={callAmount} onChange={(e) => setCallAmount(e.target.value)} />
            </Field>
            <Field label="Due date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Purpose">
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </Field>
            <p className="hint">Split pro rata by commitment. Each LP receives only its own notice.</p>
          </InlineForm>
        }
      >
        {callIds.length === 0 && <Empty>No capital calls yet.</Empty>}
        <ul className="list">
          {callIds.map((id) => {
            const open = notices.filter((n) => n.payload.callId === id);
            const paid = contributions.filter((r) => r.payload.callId === id);
            const total = [...open, ...paid].reduce((s, c) => s + num(c.payload.amount), 0);
            const due = open[0]?.payload.dueDate;
            return (
              <li key={id}>
                <span>
                  <strong>{id}</strong> <span className="num">{money(total)}</span>
                </span>
                {open.length === 0 ? (
                  <Badge tone="good">fully paid</Badge>
                ) : (
                  <Badge tone="warn">
                    {paid.length}/{paid.length + open.length} paid · due {date(due!)}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title="Distributions"
        action={
          <InlineForm
            open="Distribute"
            submit="Send distribution"
            onSubmit={() => {
              const target = commitments.find((c) => c.payload.lp === distLp) ?? commitments[0];
              const holding = cashFor(cash, num(distAmount));
              return act(`Distribution sent to ${lpName(target.payload.lp)}`, async () => {
                if (!holding) throw new Error("No single cash holding covers that amount.");
                await exercise(gp, "Fund:Commitment", target.contractId, "Distribute", {
                  distributionId: `D-${distributions.length + 1}`,
                  amount: distAmount,
                  cashCid: holding.contractId,
                  valueDate: today(),
                });
              });
            }}
          >
            <Field label="LP">
              <select value={distLp || commitments[0]?.payload.lp} onChange={(e) => setDistLp(e.target.value)}>
                {commitments.map((c) => (
                  <option key={c.contractId} value={c.payload.lp}>
                    {lpName(c.payload.lp)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (USD)">
              <input inputMode="decimal" value={distAmount} onChange={(e) => setDistAmount(e.target.value)} />
            </Field>
          </InlineForm>
        }
      >
        <Row k="GP cash available" v={money(cashBalance)} />
        <Row k="Paid out so far" v={`${money(distributed)} · ${distributions.length} payments`} />
      </Section>

      <Section title="Auditor access">
        {grant ? (
          <ContractCard
            cid={grant.contractId}
            title="Audit grant"
            aside={<ActionButton variant="ghost" label="Revoke" run={() => act("Audit grant revoked", () => exercise(gp, "Reporting:AuditGrant", grant.contractId, "RevokeAudit", {}))} />}
          >
            <Row k="Valid until" v={date(grant.payload.validUntil)} />
          </ContractCard>
        ) : (
          <ActionButton
            label="Grant auditor 30-day access"
            run={() =>
              act("Auditor access granted", () =>
                create(gp, "Reporting:AuditGrant", {
                  gp,
                  auditor: parties.Auditor,
                  administrator: fund.payload.administrator,
                  fundId: fund.payload.fundId,
                  validUntil: daysFromNow(30).toISOString(),
                }),
              )
            }
          />
        )}
      </Section>
    </>
  );
}

function LinkedRow({ cid, children }: { cid: string; children: ReactNode }) {
  const { hovered, setHovered } = useStore();
  return (
    <tr className={hovered === cid ? "linked" : undefined} onMouseEnter={() => setHovered(cid)} onMouseLeave={() => setHovered(null)}>
      {children}
    </tr>
  );
}

// ---------------------------------------------------------------- Administrator

// The administrator serves several managers; each desk is one fund.
function AdminView() {
  const { acs } = useStore();
  const desks = of<AdminDesk>(acs.Administrator, "Reporting:AdminDesk").sort((a, b) =>
    a.payload.fundId.localeCompare(b.payload.fundId),
  );
  if (desks.length === 0) return <Empty>No admin desk yet.</Empty>;
  return (
    <>
      {desks.map((d) => (
        <AdminFund key={d.contractId} desk={d} />
      ))}
    </>
  );
}

function AdminFund({ desk }: { desk: Contract<AdminDesk> }) {
  const { acs, parties, act } = useStore();
  const admin = parties.Administrator!;
  const { fundId, gp } = desk.payload;
  const mine = acs.Administrator;
  const inFund = <T extends { fundId: string }>(cs: Contract<T>[]) => cs.filter((c) => c.payload.fundId === fundId);
  const commitments = byLp(inFund(of<Commitment>(mine, "Fund:Commitment")));
  const nav = latestBy(inFund(of<NavStatement>(mine, "Reporting:NavStatement")), (p) => p.asOf);
  const attestations = inFund(of<MfnAttestation>(mine, "Reporting:MfnAttestation"));
  const grant = inFund(of<AuditGrant>(mine, "Reporting:AuditGrant"))[0];
  const views = inFund(of<AuditView>(mine, "Reporting:AuditView"));

  const contributed = commitments.reduce((s, c) => s + num(c.payload.contributed), 0);
  const [navInput, setNavInput] = useState("");
  const navValue = navInput || String(Math.round(contributed * 1.08));

  const deskEx = (choice: string, arg: unknown) => exercise(admin, "Reporting:AdminDesk", desk.contractId, choice, arg);

  return (
    <div className="fund-block" style={{ ["--fund" as string]: fundHue(fundId) }}>
      <h3 className="fund-title">
        <span className="fund-dot" />
        {commitments[0]?.payload.fundName ?? fundId}
        <span className="muted"> · {partyName(gp)}</span>
      </h3>
      <FundHealth mine={mine} fundId={fundId} />
      <Section
        title="Net asset value"
        action={
          <InlineForm
            open="Publish NAV"
            submit="Sign & publish"
            onSubmit={() =>
              act("NAV published with LP statements", () =>
                deskEx("PublishNav", { asOf: today(), nav: navValue, commitmentCids: commitments.map((c) => c.contractId) }),
              )
            }
          >
            <Field label={`Fund NAV (contributed: ${money(contributed)})`}>
              <input inputMode="decimal" value={navValue} onChange={(e) => setNavInput(e.target.value)} />
            </Field>
            <p className="hint">One transaction: the fund NAV for the GP plus a statement for each LP.</p>
          </InlineForm>
        }
      >
        {nav ? (
          <ContractCard cid={nav.contractId} title={`NAV ${date(nav.payload.asOf)}`}>
            <div className="stats">
              <Stat label="NAV" value={moneyShort(num(nav.payload.nav))} />
              <Stat label="Contributed" value={moneyShort(num(nav.payload.totalContributed))} />
              <Stat label="LPs" value={nav.payload.lpCount} />
            </div>
          </ContractCard>
        ) : (
          <Empty>No NAV published yet.</Empty>
        )}
      </Section>

      <Section title="Most-favoured-nation checks">
        {!commitments.some((c) => c.payload.terms.mostFavouredNation) && <Empty>No LP in this fund has an MFN right.</Empty>}
        <ul className="list">
          {commitments
            .filter((c) => c.payload.terms.mostFavouredNation)
            .map((c) => {
              const att = latestBy(attestations.filter((a) => a.payload.lp === c.payload.lp), (p) => p.attestedAt);
              return (
                <li key={c.contractId}>
                  <span>
                    {lpName(c.payload.lp)}{" "}
                    {att && (
                      <Badge tone={att.payload.isMostFavoured ? "good" : "bad"}>
                        {att.payload.isMostFavoured ? "best terms" : "better terms exist"}
                      </Badge>
                    )}
                  </span>
                  <ActionButton
                    variant="ghost"
                    label={att ? "Re-check" : "Check"}
                    run={() =>
                      act(`MFN check for ${lpName(c.payload.lp)}`, () =>
                        deskEx("AttestMfn", {
                          commitmentCid: c.contractId,
                          peerCommitmentCids: commitments.filter((p) => p.contractId !== c.contractId).map((p) => p.contractId),
                        }),
                      )
                    }
                  />
                </li>
              );
            })}
        </ul>
        <p className="hint">The LP gets a signed verdict. Other LPs' terms never reach its node.</p>
      </Section>

      <Section title="Audit disclosures">
        {!grant ? (
          <Empty>No audit grant from the GP.</Empty>
        ) : (
          <ul className="list">
            {commitments.map((c) => {
              const shared = views.some((v) => v.payload.lp === c.payload.lp);
              return (
                <li key={c.contractId}>
                  <span>{lpName(c.payload.lp)}</span>
                  {shared ? (
                    <Badge tone="good">disclosed</Badge>
                  ) : (
                    <ActionButton
                      variant="ghost"
                      label="Disclose"
                      run={() =>
                        act(`${lpName(c.payload.lp)} disclosed to auditor`, () =>
                          deskEx("DiscloseToAuditor", { grantCid: grant.contractId, commitmentCid: c.contractId }),
                        )
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- LP

/** One fund position, assembled from the contracts on the LP's own node. */
type Holding = {
  fundId: string;
  fundName: string;
  gp: string;
  commitment: Contract<Commitment>;
  statement?: Contract<LpStatement>;
  mfn?: Contract<MfnAttestation>;
  committed: number;
  contributed: number;
  distributed: number;
  /** Latest administrator NAV mark, plus capital called since it at cost. */
  value: number;
};

function holdingsOf(mine: Contract[] | undefined): Holding[] {
  const statements = of<LpStatement>(mine, "Reporting:LpStatement");
  const attestations = of<MfnAttestation>(mine, "Reporting:MfnAttestation");
  return of<Commitment>(mine, "Fund:Commitment")
    .map((commitment) => {
      const { fundId, fundName, gp } = commitment.payload;
      const statement = latestBy(statements.filter((s) => s.payload.fundId === fundId), (p) => p.asOf);
      const mfn = latestBy(attestations.filter((a) => a.payload.fundId === fundId), (p) => p.attestedAt);
      const contributed = num(commitment.payload.contributed);
      const value = statement
        ? num(statement.payload.navShare) + contributed - num(statement.payload.contributed)
        : contributed;
      return {
        fundId,
        fundName,
        gp,
        commitment,
        statement,
        mfn,
        committed: num(commitment.payload.committed),
        contributed,
        distributed: num(commitment.payload.distributed),
        value,
      };
    })
    .sort((a, b) => a.fundId.localeCompare(b.fundId));
}

const tvpiOf = (h: { contributed: number; distributed: number; value: number }) =>
  h.contributed > 0 ? (h.distributed + h.value) / h.contributed : null;
const shortDate = (iso: string) => date(iso).replace(/, d{4}$/, "");
const times = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}×`);

function LpView({ role }: { role: Role }) {
  const { acs, parties, act } = useStore();
  const lp = parties[role]!;
  const mine = acs[role];
  const holdings = holdingsOf(mine);
  const notices = of<CallNotice>(mine, "Fund:CapitalCallNotice").sort((a, b) =>
    a.payload.dueDate.localeCompare(b.payload.dueDate),
  );
  const cash = of<Cash>(mine, "Cash:Cash").filter((c) => c.payload.owner === lp);
  const contributions = of<ContributionReceipt>(mine, "Fund:ContributionReceipt");
  const distributions = of<DistributionReceipt>(mine, "Fund:DistributionReceipt");

  if (holdings.length === 0) return <Empty>No commitments yet.</Empty>;

  const total = holdings.reduce(
    (t, h) => ({
      committed: t.committed + h.committed,
      contributed: t.contributed + h.contributed,
      distributed: t.distributed + h.distributed,
      value: t.value + h.value,
    }),
    { committed: 0, contributed: 0, distributed: 0, value: 0 },
  );
  const managers = new Set(holdings.map((h) => h.gp)).size;
  const cashAvailable = cash.reduce((s, h) => s + num(h.payload.amount), 0);
  const due = notices.reduce((s, n) => s + num(n.payload.amount), 0);
  const nameOf = (fundId: string) => holdings.find((h) => h.fundId === fundId)?.fundName ?? fundId;

  const activity = [
    ...contributions.map((r) => ({
      id: r.contractId, at: r.payload.valueDate, fundId: r.payload.fundId,
      label: `Paid ${r.payload.callId}`, amount: -num(r.payload.amount),
    })),
    ...distributions.map((r) => ({
      id: r.contractId, at: r.payload.valueDate, fundId: r.payload.fundId,
      label: `Received ${r.payload.distributionId}`, amount: num(r.payload.amount),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <section className="card portfolio">
        <header className="card-head">
          <h4>Portfolio</h4>
          <Badge tone="neutral">
            {holdings.length} {holdings.length === 1 ? "fund" : "funds"} · {managers} {managers === 1 ? "manager" : "managers"}
          </Badge>
        </header>
        <div className="stats">
          <Stat label="Committed" value={moneyShort(total.committed)} />
          <Stat label="Called" value={moneyShort(total.contributed)} sub={pct(total.contributed / total.committed)} />
          <Stat label="Value" value={moneyShort(total.value)} />
          <Stat label="Distributed" value={moneyShort(total.distributed)} />
          <Stat label="TVPI" value={times(tvpiOf(total))} />
          <Stat label="DPI" value={times(total.contributed ? total.distributed / total.contributed : null)} />
        </div>
        <div className="alloc" role="img" aria-label="Value by fund">
          {holdings.map((h) => (
            <span
              key={h.fundId}
              style={{ width: `${(h.value / total.value) * 100}%`, ["--fund" as string]: fundHue(h.fundId) }}
              title={`${h.fundName}: ${money(h.value)}`}
            />
          ))}
        </div>
        <ul className="alloc-legend">
          {holdings.map((h) => (
            <li key={h.fundId} style={{ ["--fund" as string]: fundHue(h.fundId) }}>
              <span className="fund-dot" />
              {h.fundId} <span className="muted num">{pct(h.value / total.value)}</span>
            </li>
          ))}
        </ul>
        <footer className="card-foot">
          <span className="muted">Combined on this node only. Neither manager can see the other fund.</span>
        </footer>
      </section>

      <Section title="Funds">
        <table className="table">
          <thead>
            <tr>
              <th>Fund</th>
              <th className="r">Called</th>
              <th className="r">Value</th>
              <th className="r">TVPI</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <LinkedRow key={h.fundId} cid={h.commitment.contractId}>
                <td style={{ ["--fund" as string]: fundHue(h.fundId) }}>
                  <span className="fund-dot" />
                  {h.fundId}
                  <div className="muted small">{partyName(h.gp)}</div>
                </td>
                <td className="r num">
                  {pct(h.contributed / h.committed)}
                  <div className="muted small">{moneyShort(h.committed)}</div>
                </td>
                <td className="r num">
                  {moneyShort(h.value)}
                  <div className="muted small">{h.statement ? `NAV ${shortDate(h.statement.payload.asOf)}` : "at cost"}</div>
                </td>
                <td className="r num">{times(tvpiOf(h))}</td>
              </LinkedRow>
            ))}
          </tbody>
        </table>
        <p className="hint">Value is the administrator's latest NAV mark plus capital called since, at cost.</p>
      </Section>

      <LpPerformance mine={mine} />
      <LpCashFlows mine={mine} />

      <Section
        title="Capital calls"
        action={
          notices.length > 0 && (
            <Badge tone={cashAvailable >= due ? "good" : "bad"}>
              {money(due)} due · {cashAvailable >= due ? "covered" : `short ${moneyShort(due - cashAvailable)}`}
            </Badge>
          )
        }
      >
        {notices.length === 0 && <Empty>Nothing due across your funds.</Empty>}
        {notices.map((n) => {
          const commitment = holdings.find((h) => h.fundId === n.payload.fundId && h.gp === n.payload.gp)?.commitment;
          const holding = cashFor(cash, num(n.payload.amount));
          return (
            <ContractCard
              key={n.contractId}
              cid={n.contractId}
              title={
                <span style={{ ["--fund" as string]: fundHue(n.payload.fundId) }}>
                  <span className="fund-dot" />
                  {n.payload.fundId} {n.payload.callId} · {money(num(n.payload.amount))}
                </span>
              }
              aside={<Badge tone="warn">due {date(n.payload.dueDate)}</Badge>}
            >
              <p className="muted small">
                {nameOf(n.payload.fundId)}: {n.payload.purpose}
              </p>
              <ActionButton
                label="Pay now"
                disabled={!holding || !commitment}
                run={() =>
                  act(`${n.payload.fundId} ${n.payload.callId} paid`, () =>
                    exercise(lp, "Fund:CapitalCallNotice", n.contractId, "PayCall", {
                      commitmentCid: commitment!.contractId,
                      cashCid: holding!.contractId,
                      valueDate: today(),
                    }),
                  )
                }
              />
            </ContractCard>
          );
        })}
        <Row k="Cash available" v={money(cashAvailable)} />
      </Section>

      <Section title="Statements">
        {holdings.every((h) => !h.statement) && <Empty>No statements yet.</Empty>}
        {holdings
          .filter((h) => h.statement)
          .map((h) => {
            const s = h.statement!.payload;
            return (
              <ContractCard
                key={h.fundId}
                cid={h.statement!.contractId}
                title={
                  <span style={{ ["--fund" as string]: fundHue(h.fundId) }}>
                    <span className="fund-dot" />
                    {h.fundId} · {date(s.asOf)}
                  </span>
                }
                aside={<Badge tone="neutral">signed by admin</Badge>}
              >
                <div className="stats">
                  <Stat label="NAV share" value={moneyShort(num(s.navShare))} />
                  <Stat label="TVPI" value={multiple(s.tvpi)} />
                  <Stat label="DPI" value={multiple(s.dpi)} />
                </div>
              </ContractCard>
            );
          })}
        {holdings
          .filter((h) => h.mfn)
          .map((h) => (
            <ContractCard
              key={`mfn-${h.fundId}`}
              cid={h.mfn!.contractId}
              title={`${h.fundId} MFN attestation`}
              aside={
                <Badge tone={h.mfn!.payload.isMostFavoured ? "good" : "bad"}>
                  {h.mfn!.payload.isMostFavoured ? "You have the best terms" : "Better terms exist"}
                </Badge>
              }
            >
              <p className="muted small">
                Compared against {h.mfn!.payload.peersCompared} LP(s) with equal or smaller commitments. Their terms stay
                private.
              </p>
            </ContractCard>
          ))}
      </Section>

      <Section title="My terms">
        <table className="table">
          <thead>
            <tr>
              <th>Fund</th>
              <th className="r">Fee</th>
              <th className="r">Carry</th>
              <th className="r">MFN</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <LinkedRow key={h.fundId} cid={h.commitment.contractId}>
                <td>{h.fundId}</td>
                <td className="r num">{bps(h.commitment.payload.terms.managementFeeBps)}</td>
                <td className="r num">{bps(h.commitment.payload.terms.carryBps)}</td>
                <td className="r">{h.commitment.payload.terms.mostFavouredNation ? "Yes" : "No"}</td>
              </LinkedRow>
            ))}
          </tbody>
        </table>
        <p className="hint">Each side letter is visible only to you, that fund's manager and its administrator.</p>
      </Section>

      <Section title="Activity">
        <ul className="list">
          {activity.map((a) => (
            <li key={a.id}>
              <span style={{ ["--fund" as string]: fundHue(a.fundId) }}>
                <span className="fund-dot" />
                {a.fundId} {a.label} <span className="muted small">{date(a.at)}</span>
              </span>
              <span className={`num ${a.amount < 0 ? "neg" : "pos"}`}>
                {a.amount < 0 ? "−" : "+"}
                {money(Math.abs(a.amount))}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- Auditor

function AuditorView() {
  const { acs } = useStore();
  const mine = acs.Auditor;
  const grant = of<AuditGrant>(mine, "Reporting:AuditGrant")[0];
  const views = of<AuditView>(mine, "Reporting:AuditView");

  return (
    <>
      <Section title="Access">
        {grant ? (
          <ContractCard cid={grant.contractId} title="Audit grant from GP" aside={<Badge tone="good">active</Badge>}>
            <Row k="Valid until" v={date(grant.payload.validUntil)} />
          </ContractCard>
        ) : (
          <Empty>No access granted. This node holds no fund data at all.</Empty>
        )}
      </Section>
      <Section title="Disclosed capital accounts">
        {grant && views.length === 0 && <Empty>Nothing disclosed yet.</Empty>}
        {views.map((v) => (
          <ContractCard key={v.contractId} cid={v.contractId} title={lpName(v.payload.lp)} aside={<Badge tone="neutral">snapshot</Badge>}>
            <Row k="Committed" v={money(num(v.payload.committed))} />
            <Row k="Contributed" v={money(num(v.payload.contributed))} />
            <Row k="Distributed" v={money(num(v.payload.distributed))} />
            <Row k="Fee / carry" v={`${bps(v.payload.terms.managementFeeBps)} / ${bps(v.payload.terms.carryBps)}`} />
            <Row k="Disclosed" v={date(v.payload.disclosedAt)} />
          </ContractCard>
        ))}
      </Section>
    </>
  );
}
