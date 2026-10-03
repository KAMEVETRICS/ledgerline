// STUB — owned by WP-B (docs/tasks/WP-B.md). Replace the body; keep the export name.
import { useLoad, fetchApps } from "../api";
import { LoadState, NetworkPage } from "../NetworkSection";

export function Apps() {
  const { data, error, loading } = useLoad(fetchApps);
  return (
    <NetworkPage title="App monitoring" lead="Activity and rewards for applications on the network." meta={data?.meta}>
      <LoadState loading={loading} error={error} />
      {data && <p className="empty">Not built yet. Data contract: AppsReport in ui/src/network/types.ts.</p>}
    </NetworkPage>
  );
}
