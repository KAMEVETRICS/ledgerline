// STUB — owned by WP-C (docs/tasks/WP-C.md). Replace the body; keep the export name.
import { useLoad, fetchLiquidity } from "../api";
import { LoadState, NetworkPage } from "../NetworkSection";

export function Liquidity() {
  const { data, error, loading } = useLoad(fetchLiquidity);
  return (
    <NetworkPage title="Liquidity" lead="Canton Coin price, supply and transfer volume, and where liquidity sits." meta={data?.meta}>
      <LoadState loading={loading} error={error} />
      {data && <p className="empty">Not built yet. Data contract: LiquidityReport in ui/src/network/types.ts.</p>}
    </NetworkPage>
  );
}
