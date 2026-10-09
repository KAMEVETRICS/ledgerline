// Self-serve demo flows: a manager invites investors, an investor accepts or
// declines, and the administrator publishes network statistics on demand.
// Every action is an ordinary command by the signed-in party.
import { useState } from "react";
import { ActionButton, Badge, ContractCard, Empty, Field, InlineForm, Row, Section } from "../components";
import { exercise, type Contract } from "../ledger";
import {
  bps,
  money,
  num,
  of,
  partyName,
  ROLE_INFO,
  today,
  type Commitment,
  type CommitmentOffer,
  type ContributionReceipt,
  type Fund,
  type NavStatement,
  type StatisticsDesk,
} from "../model";
import { useStore } from "../store";

const INVESTORS = ["LP_A", "LP_B", "LP_C"] as const;

/** Manager: offer a commitment to one of the demo investors, and see pending offers. */
export function InviteInvestor({ gp, fund, mine }: { gp: string; fund: Contract<Fund>; mine: Contract[] | undefined }) {
  const { parties, act } = useStore();
  const offers = of<CommitmentOffer>(mine, "Fund:CommitmentOffer").filter((o) => o.payload.fundId === fund.payload.fundId);
  const committed = new Set(of<Commitment>(mine, "Fund:Commitment").filter((c) => c.payload.fundId === fund.payload.fundId).map((c) => c.payload.lp));
  const available = INVESTORS.filter((r) => parties[r] && !committed.has(parties[r]!) && !offers.some((o) => o.payload.lp === parties[r]));
  const [lp, setLp] = useState<string>("");
  const [amount, setAmount] = useState("2000000");
  const [fee, setFee] = useState("200");
  const [carry, setCarry] = useState("2000");
  const [mfn, setMfn] = useState(false);
  const chosen = lp || (available[0] ? parties[available[0]]! : "");

  return (
    <Section
      title="Investors"
      action={
        available.length > 0 && (
          <InlineForm
            open="Invite an investor"
            submit="Send offer"
            onSubmit={() =>
              act(`Offer sent to ${partyName(chosen)}`, () =>
                exercise(gp, "Fund:Fund", fund.contractId, "OfferCommitment", {
                  lp: chosen,
                  amount,
                  terms: { managementFeeBps: fee, carryBps: carry, mostFavouredNation: mfn },
                }),
              )
            }
          >
            <Field label="Investor">
              <select value={chosen} onChange={(e) => setLp(e.target.value)}>
                {available.map((r) => (
                  <option key={r} value={parties[r]}>
                    {ROLE_INFO[r].name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Commitment (USD)">
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Management fee (basis points)">
              <input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} />
            </Field>
            <Field label="Carry (basis points)">
              <input inputMode="numeric" value={carry} onChange={(e) => setCarry(e.target.value)} />
            </Field>
            <label className="field checkbox">
              <input type="checkbox" checked={mfn} onChange={(e) => setMfn(e.target.checked)} />
              <span>Most-favoured-nation right</span>
            </label>
            <p className="hint">The offer and its terms are visible only to you, that investor and the administrator.</p>
          </InlineForm>
        )
      }
    >
      {offers.length === 0 && committed.size === 0 && <Empty>No investors yet. Invite one to start.</Empty>}
      {offers.map((o) => (
        <ContractCard key={o.contractId} cid={o.contractId} title={`${partyName(o.payload.lp)} · ${money(num(o.payload.amount))}`} aside={<Badge tone="warn">awaiting answer</Badge>}>
          <Row k="Fee / carry" v={`${bps(o.payload.terms.managementFeeBps)} / ${bps(o.payload.terms.carryBps)}`} />
          <ActionButton
            variant="ghost"
            label="Withdraw offer"
            run={() => act("Offer withdrawn", () => exercise(gp, "Fund:CommitmentOffer", o.contractId, "WithdrawOffer", {}))}
          />
        </ContractCard>
      ))}
      {offers.length > 0 && <p className="hint">Switch to that investor ("Leave view", then View as) to accept.</p>}
    </Section>
  );
}

/** Investor: offers waiting for an answer. */
export function CommitmentOffers({ lp, mine }: { lp: string; mine: Contract[] | undefined }) {
  const { act } = useStore();
  const offers = of<CommitmentOffer>(mine, "Fund:CommitmentOffer");
  if (offers.length === 0) return null;
  return (
    <Section title="Offers to invest">
      {offers.map((o) => (
        <ContractCard
          key={o.contractId}
          cid={o.contractId}
          title={`${o.payload.fundName} · ${money(num(o.payload.amount))}`}
          aside={<Badge tone="warn">from {partyName(o.payload.gp)}</Badge>}
        >
          <Row k="Management fee" v={bps(o.payload.terms.managementFeeBps)} />
          <Row k="Carry" v={bps(o.payload.terms.carryBps)} />
          <Row k="MFN right" v={o.payload.terms.mostFavouredNation ? "Yes" : "No"} />
          <div className="form-actions" style={{ justifyContent: "flex-start" }}>
            <ActionButton
              label="Accept"
              run={() => act(`Committed to ${o.payload.fundName}`, () => exercise(lp, "Fund:CommitmentOffer", o.contractId, "AcceptCommitment", {}))}
            />
            <ActionButton
              variant="ghost"
              label="Decline"
              run={() => act("Offer declined", () => exercise(lp, "Fund:CommitmentOffer", o.contractId, "DeclineCommitment", {}))}
            />
          </div>
        </ContractCard>
      ))}
    </Section>
  );
}

const quarterOf = (iso: string) => `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
const quarterStart = (iso: string) => {
  const q = Math.floor((Number(iso.slice(5, 7)) - 1) / 3);
  return `${iso.slice(0, 4)}-${String(q * 3 + 1).padStart(2, "0")}-01`;
};

/** Administrator: publish network statistics for the current quarter, across every fund it runs. */
export function PublishStatistics({ admin, mine }: { admin: string; mine: Contract[] | undefined }) {
  const { act } = useStore();
  const desk = of<StatisticsDesk>(mine, "Reporting:StatisticsDesk")[0];
  if (!desk) return null;
  const commitments = of<Commitment>(mine, "Fund:Commitment");
  const navs = of<NavStatement>(mine, "Reporting:NavStatement");
  // The latest NAV of each fund.
  const latest = new Map<string, Contract<NavStatement>>();
  for (const n of navs) {
    const seen = latest.get(n.payload.fundId);
    if (!seen || n.payload.asOf > seen.payload.asOf) latest.set(n.payload.fundId, n);
  }
  const now = today();
  const period = quarterOf(now);
  const receipts = of<ContributionReceipt>(mine, "Fund:ContributionReceipt").filter(
    (r) => r.payload.valueDate >= quarterStart(now) && r.payload.valueDate <= now,
  );
  const funds = new Set(commitments.map((c) => c.payload.fundId)).size;
  const lps = new Set(commitments.map((c) => c.payload.lp)).size;

  return (
    <Section
      title="Network statistics"
      action={
        <ActionButton
          label={`Publish ${period}`}
          run={() =>
            act(`Statistics published for ${period}`, () =>
              exercise(admin, "Reporting:StatisticsDesk", desk.contractId, "PublishStatistics", {
                period,
                asOf: now,
                commitmentCids: commitments.map((c) => c.contractId),
                navCids: [...latest.values()].map((n) => n.contractId),
                receiptCids: receipts.map((r) => r.contractId),
              }),
            )
          }
        />
      }
    >
      <Row k="Funds / investors across your book" v={`${funds} / ${lps}`} />
      <Row k="Payments this quarter" v={receipts.length} />
      <p className="hint">
        Published to the ecosystem viewer only when at least 3 funds and 5 investors contribute. The contract refuses anything
        smaller. Funds without a NAV yet are counted, but have no TVPI.
      </p>
    </Section>
  );
}
