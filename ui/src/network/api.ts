import { useEffect, useState } from "react";
import type { AppsReport, LiquidityReport, NetworkOverview, PartyPortfolio, ValidatorsReport } from "./types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export const fetchOverview = () => get<NetworkOverview>("/api/network/overview");
export const fetchValidators = () => get<ValidatorsReport>("/api/network/validators");
export const fetchApps = () => get<AppsReport>("/api/network/apps");
export const fetchLiquidity = () => get<LiquidityReport>("/api/network/liquidity");
export const fetchParty = (party: string) => get<PartyPortfolio>(`/api/network/party/${encodeURIComponent(party)}`);

export type Loadable<T> = { data: T | null; error: string | null; loading: boolean };

/** Load once on mount (and when `key` changes). Pages render their own loading and error states. */
export function useLoad<T>(load: () => Promise<T>, key: unknown = null): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ data: null, error: null, loading: true });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e) => live && setState({ data: null, error: e instanceof Error ? e.message : String(e), loading: false }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
