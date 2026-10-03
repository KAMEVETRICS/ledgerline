// STUB — owned by WP-B (docs/tasks/WP-B.md). Replace the body; keep the export name.
import { useLoad, fetchOverview } from "../api";
import { LoadState, NetworkPage } from "../NetworkSection";

export function Overview() {
  const { data, error, loading } = useLoad(fetchOverview);
  return (
    <NetworkPage title="Network overview" lead="Canton Network activity at a glance." meta={data?.meta}>
      <LoadState loading={loading} error={error} />
      {data && <p className="empty">Not built yet. Data contract: NetworkOverview in ui/src/network/types.ts.</p>}
    </NetworkPage>
  );
}
