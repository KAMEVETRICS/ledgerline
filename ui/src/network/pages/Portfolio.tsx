// STUB — owned by WP-C (docs/tasks/WP-C.md). Replace the body; keep the export name.
import { useState } from "react";
import { fetchParty, useLoad } from "../api";
import { LoadState, NetworkPage } from "../NetworkSection";

export function Portfolio() {
  const [party] = useState("sample-party::12200000");
  const { data, error, loading } = useLoad(() => fetchParty(party), party);
  return (
    <NetworkPage title="Portfolio lookup" lead="Holdings and recent activity for any public Canton party." meta={data?.meta}>
      <LoadState loading={loading} error={error} />
      {data && <p className="empty">Not built yet. Data contract: PartyPortfolio in ui/src/network/types.ts.</p>}
    </NetworkPage>
  );
}
