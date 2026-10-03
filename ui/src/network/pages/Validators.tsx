// STUB — owned by WP-B (docs/tasks/WP-B.md). Replace the body; keep the export name.
import { useLoad, fetchValidators } from "../api";
import { LoadState, NetworkPage } from "../NetworkSection";

export function Validators() {
  const { data, error, loading } = useLoad(fetchValidators);
  return (
    <NetworkPage title="Validators" lead="Who keeps the network running, how reliably, and what they earn." meta={data?.meta}>
      <LoadState loading={loading} error={error} />
      {data && <p className="empty">Not built yet. Data contract: ValidatorsReport in ui/src/network/types.ts.</p>}
    </NetworkPage>
  );
}
