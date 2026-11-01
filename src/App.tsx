import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, BadgeCheck, ChevronDown, ChevronLeft,
  ChevronRight, CircleAlert, Copy, ExternalLink, FileSearch, Globe2, LoaderCircle,
  RefreshCw, Search, ShieldCheck, Sparkles, WalletCards, X
} from "lucide-react";

const HORIZON = "https://horizon-testnet.stellar.org";
const EXPLORER = "https://stellar.expert/explorer/testnet";
const PAGE_SIZE = 50;

type HorizonAsset = {
  asset_type: string;
  asset_code: string;
  asset_issuer: string;
  paging_token: string;
  accounts?: {
    authorized?: number;
    authorized_to_maintain_liabilities?: number;
    unauthorized?: number;
  };
  balances?: {
    authorized?: string;
    authorized_to_maintain_liabilities?: string;
    unauthorized?: string;
  };
  claimable_balances_amount?: string;
  contracts?: { contract_id?: string };
};

type AssetPage = {
  _embedded?: { records?: HorizonAsset[] };
  _links?: { next?: { href?: string }; self?: { href?: string } };
};

type AssetRecord = HorizonAsset & { key: string };

const shortAddress = (value: string, start = 7, end = 6) =>
  value ? `${value.slice(0, start)}…${value.slice(-end)}` : "—";

const amount = (value?: string | number) => {
  if (value === undefined || value === null || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(parsed)
    : String(value);
};

const assetKey = (asset: HorizonAsset) =>
  asset.asset_type === "native" ? "XLM-native" : `${asset.asset_code}:${asset.asset_issuer}`;

function AssetMark({ code }: { code: string }) {
  const initials = (code || "??").slice(0, 2).toUpperCase();
  return <span className="asset-mark" aria-hidden="true">{initials}</span>;
}

function App() {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AssetRecord | null>(null);
  const [sortBy, setSortBy] = useState<"code" | "accounts">("code");
  const [sortMenu, setSortMenu] = useState(false);

  const readPage = useCallback(async (url: string, signal?: AbortSignal) => {
    const response = await fetch(url, { signal, headers: { Accept: "application/hal+json" } });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Horizon returned ${response.status}${detail ? `: ${detail.slice(0, 100)}` : ""}`);
    }
    return (await response.json()) as AssetPage;
  }, []);

  const loadDirectory = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await readPage(`${HORIZON}/assets?limit=200&order=desc`, signal);
      const records = data._embedded?.records ?? [];
      setAssets(records.map((asset) => ({ ...asset, key: assetKey(asset) })));
      setNextUrl(data._links?.next?.href ?? null);
      if (!records.length) setNotice("No public assets were returned by testnet yet. Try searching by an exact asset code or issuer address.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Could not connect to Stellar testnet.");
      setNotice("You can still search directly by asset code or issuer public key.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [readPage]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDirectory(controller.signal);
    return () => controller.abort();
  }, [loadDirectory]);

  const submitSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const query = search.trim();
    setAppliedSearch(query);
    setPage(1);
    setError("");
    setNotice("");
    if (!query) {
      await loadDirectory();
      return;
    }

    setSearching(true);
    try {
      const looksLikeIssuer = /^G[A-Z2-7]{55}$/.test(query.toUpperCase());
      const params = new URLSearchParams({ limit: "200", order: "desc" });
      params.set(looksLikeIssuer ? "asset_issuer" : "asset_code", looksLikeIssuer ? query.toUpperCase() : query);
      const data = await readPage(`${HORIZON}/assets?${params.toString()}`);
      const records = data._embedded?.records ?? [];
      setAssets(records.map((asset) => ({ ...asset, key: assetKey(asset) })));
      setNextUrl(data._links?.next?.href ?? null);
      if (!records.length) setNotice("No matching assets found on Stellar testnet. Asset codes are exact-match searches; check the issuer address and try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Asset search failed.");
    } finally {
      setSearching(false);
    }
  };

  const loadMore = async () => {
    if (!nextUrl || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await readPage(nextUrl);
      const records = (data._embedded?.records ?? []).map((asset) => ({ ...asset, key: assetKey(asset) }));
      setAssets((current) => {
        const seen = new Set(current.map((asset) => asset.key));
        return [...current, ...records.filter((asset) => !seen.has(asset.key))];
      });
      setNextUrl(data._links?.next?.href ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more assets.");
    } finally {
      setLoadingMore(false);
    }
  };

  const sortedAssets = useMemo(() => [...assets].sort((a, b) => {
    if (sortBy === "accounts") return (b.accounts?.authorized ?? 0) - (a.accounts?.authorized ?? 0);
    return (a.asset_code || "XLM").localeCompare(b.asset_code || "XLM");
  }), [assets, sortBy]);

  const pageCount = Math.max(1, Math.ceil(sortedAssets.length / PAGE_SIZE));
  const visibleAssets = sortedAssets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalTrustlines = assets.reduce((sum, asset) => sum + (asset.accounts?.authorized ?? 0), 0);
  const issuerCount = new Set(assets.filter((asset) => asset.asset_issuer).map((asset) => asset.asset_issuer)).size;

  const copyText = async (text: string, label = "Copied to clipboard") => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(label);
      window.setTimeout(() => setNotice(""), 2500);
    } catch {
      setNotice("Clipboard access was blocked by your browser. Select and copy the text manually.");
    }
  };

  const assetUrl = (asset: AssetRecord) =>
    asset.asset_type === "native"
      ? `${EXPLORER}/account/GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF`
      : `${EXPLORER}/asset/${encodeURIComponent(asset.asset_code)}-${asset.asset_issuer}`;

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Stellar Atlas home">
          <span className="brand-icon"><Sparkles size={20} strokeWidth={2.2} /></span>
          <span>stellar<span className="brand-light">atlas</span><small>ASSET DIRECTORY</small></span>
        </a>
        <div className="topbar-right">
          <span className="network-pill"><span className="pulse-dot" /> TESTNET</span>
          <a className="top-link" href="https://developers.stellar.org/" target="_blank" rel="noreferrer">Docs <ExternalLink size={13} /></a>
          <a className="avatar" href="https://stellar.org/" target="_blank" rel="noreferrer" aria-label="Stellar website">S</a>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> THE STELLAR ECOSYSTEM, EXPLORED</div>
            <h1>Every asset.<br /><span>One universe.</span></h1>
            <p className="hero-subtitle">Discover tokens issued on Stellar. Explore asset codes, issuer accounts, trustline activity, and live network data — all on testnet.</p>
            <form className="search-form" onSubmit={submitSearch}>
              <Search size={19} className="search-icon" />
              <input
                aria-label="Search asset code or issuer"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search asset code or issuer address..."
              />
              {search && <button className="clear-search" type="button" aria-label="Clear search" onClick={() => { setSearch(""); setAppliedSearch(""); void loadDirectory(); }}><X size={16} /></button>}
              <button className="search-button" type="submit" disabled={searching}>
                {searching ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />} <span>Search</span>
              </button>
            </form>
            <div className="search-hints"><span>Try a code</span><span className="hint-divider">/</span><span>paste an issuer public key</span><span className="hint-divider">/</span><span>browse all assets</span></div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="orbit orbit-c" />
            <div className="planet"><div className="planet-core">S</div><div className="planet-shine" /></div>
            <div className="float-card float-card-top"><span className="float-dot green" /> Horizon API <strong>LIVE</strong></div>
            <div className="float-card float-card-bottom"><Globe2 size={15} /><span>Stellar testnet</span><span className="mini-status" /></div>
          </div>
        </section>

        <section className="stats-grid" aria-label="Directory statistics">
          <div className="stat-card"><div className="stat-icon violet"><WalletCards size={18} /></div><div className="stat-label">ASSETS LOADED</div><div className="stat-value">{loading ? "—" : amount(assets.length)}<span className="stat-unit">assets</span></div><div className="stat-foot">Current result set</div></div>
          <div className="stat-card"><div className="stat-icon mint"><ShieldCheck size={18} /></div><div className="stat-label">UNIQUE ISSUERS</div><div className="stat-value">{loading ? "—" : amount(issuerCount)}</div><div className="stat-foot">Issuer accounts represented</div></div>
          <div className="stat-card"><div className="stat-icon blue"><Activity size={18} /></div><div className="stat-label">AUTHORIZED TRUSTLINES</div><div className="stat-value">{loading ? "—" : amount(totalTrustlines)}</div><div className="stat-foot">Across loaded assets</div></div>
          <div className="stat-card network-stat"><div className="stat-icon amber"><Globe2 size={18} /></div><div className="stat-label">NETWORK STATUS</div><div className="stat-value status-value"><span className="pulse-dot" /> Testnet</div><div className="stat-foot">Public Horizon endpoint</div></div>
        </section>

        <section className="directory-section">
          <div className="section-heading">
            <div><div className="eyebrow section-eyebrow">BROWSE THE NETWORK</div><h2>Asset directory <span className="result-count">{assets.length}</span></h2><p>Data served directly from Stellar Horizon testnet.</p></div>
            <div className="table-actions">
              <div className="sort-wrap">
                <button className="outline-button" onClick={() => setSortMenu((open) => !open)}><ArrowDownRight size={15} /> Sort by <ChevronDown size={14} /></button>
                {sortMenu && <div className="sort-menu"><button onClick={() => { setSortBy("code"); setSortMenu(false); setPage(1); }}>Asset code A–Z</button><button onClick={() => { setSortBy("accounts"); setSortMenu(false); setPage(1); }}>Most trustlines</button></div>}
              </div>
              <button className="outline-button refresh-button" onClick={() => { setSearch(""); setAppliedSearch(""); setPage(1); void loadDirectory(); }} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh</button>
            </div>
          </div>

          {appliedSearch && <div className="filter-banner"><Search size={14} /> Results for <strong>{appliedSearch}</strong><button onClick={() => { setSearch(""); setAppliedSearch(""); setPage(1); void loadDirectory(); }}>Clear filter <X size={13} /></button></div>}
          {notice && <div className="notice"><CircleAlert size={16} /> <span>{notice}</span></div>}
          {error && <div className="error-banner"><CircleAlert size={17} /><div><strong>Couldn’t load testnet data</strong><p>{error}</p><button onClick={() => void submitSearch()}>Try search again</button></div></div>}

          <div className="table-shell">
            <div className="table-scroll">
              <table>
                <thead><tr><th>ASSET</th><th>ISSUER ACCOUNT</th><th>AUTHORIZED TRUSTLINES</th><th>AUTHORIZED BALANCE</th><th>TYPE</th><th><span className="sr-only">Details</span></th></tr></thead>
                <tbody>
                  {loading && assets.length === 0 ? Array.from({ length: 5 }, (_, i) => <tr key={i} className="skeleton-row"><td><span className="skeleton wide" /></td><td><span className="skeleton wider" /></td><td><span className="skeleton medium" /></td><td><span className="skeleton medium" /></td><td><span className="skeleton short" /></td><td /></tr>) :
                    visibleAssets.map((asset) => (
                      <tr key={asset.key} className="asset-row" onClick={() => setSelected(asset)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelected(asset); }}>
                        <td><div className="asset-cell"><AssetMark code={asset.asset_type === "native" ? "XLM" : asset.asset_code} /><div><strong>{asset.asset_type === "native" ? "XLM" : asset.asset_code}</strong><span>{asset.asset_type === "native" ? "Native Stellar asset" : asset.asset_type.replace(/_/g, " ")}</span></div></div></td>
                        <td><button className="issuer-link" onClick={(event) => { event.stopPropagation(); if (asset.asset_issuer) void copyText(asset.asset_issuer, "Issuer address copied"); }}>{asset.asset_issuer ? shortAddress(asset.asset_issuer) : "Native asset"}{asset.asset_issuer && <Copy size={12} />}</button></td>
                        <td><span className="number-cell">{amount(asset.accounts?.authorized)}</span></td>
                        <td><span className="number-cell">{amount(asset.balances?.authorized)}</span></td>
                        <td><span className={asset.asset_type === "native" ? "type-badge native" : "type-badge"}>{asset.asset_type === "native" ? "Native" : "Classic"}</span></td>
                        <td><button className="row-open" aria-label={`View ${asset.asset_code} details`} onClick={(event) => { event.stopPropagation(); setSelected(asset); }}><ChevronRight size={17} /></button></td>
                      </tr>
                    ))
                  }
                  {!loading && !visibleAssets.length && !error && <tr><td colSpan={6}><div className="empty-state"><FileSearch size={26} /><strong>No assets to display</strong><span>Search by exact asset code or issuer public key, or refresh the directory.</span></div></td></tr>}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>Showing <strong>{assets.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, assets.length)}</strong> of <strong>{assets.length}</strong> loaded assets</span>
              <div className="pagination">
                <button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft size={16} /></button>
                <span>Page <strong>{page}</strong> of <strong>{pageCount}</strong></span>
                <button aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}><ChevronRight size={16} /></button>
              </div>
            </div>
          </div>
          {nextUrl && <div className="load-more-wrap"><button className="load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <LoaderCircle className="spin" size={16} /> : <ArrowDownRight size={16} />}{loadingMore ? "Loading assets…" : "Load more from Horizon"}</button></div>}
          <div className="table-note"><BadgeCheck size={15} /><span>Public on-chain data only. Asset presence does not imply endorsement, safety, or official verification.</span></div>
        </section>

        <section className="bottom-callout"><div className="callout-icon"><Globe2 size={21} /></div><div><strong>Built for the Stellar testnet</strong><span>Explore test assets safely. Testnet tokens have no real-world value.</span></div><a href="https://laboratory.stellar.org/#?network=test" target="_blank" rel="noreferrer">Open Stellar Laboratory <ExternalLink size={14} /></a></section>
      </main>

      <footer className="footer"><a className="footer-brand" href="#top"><Sparkles size={16} /> stellaratlas</a><span>Independent community directory · Testnet only</span><a href="https://horizon-testnet.stellar.org" target="_blank" rel="noreferrer">Horizon API <ExternalLink size={12} /></a></footer>

      {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
        <section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-top"><span className="modal-kicker">ASSET DETAILS · TESTNET</span><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close details"><X size={18} /></button></div>
          <div className="modal-asset-head"><AssetMark code={selected.asset_type === "native" ? "XLM" : selected.asset_code} /><div><h3 id="modal-title">{selected.asset_type === "native" ? "XLM" : selected.asset_code}</h3><span>{selected.asset_type === "native" ? "Native Stellar asset" : selected.asset_type.replace(/_/g, " ")}</span></div><span className="type-badge">{selected.asset_type === "native" ? "Native" : "Classic"}</span></div>
          <div className="modal-divider" />
          <div className="detail-label">ISSUER PUBLIC KEY</div>
          <div className="issuer-box"><span>{selected.asset_issuer || "Native asset — no issuer key"}</span>{selected.asset_issuer && <button onClick={() => void copyText(selected.asset_issuer, "Issuer address copied")} aria-label="Copy issuer"><Copy size={15} /></button>}</div>
          <div className="detail-grid"><div><span>Authorized trustlines</span><strong>{amount(selected.accounts?.authorized)}</strong></div><div><span>Authorized balance</span><strong>{amount(selected.balances?.authorized)}</strong></div><div><span>Unauthorized trustlines</span><strong>{amount(selected.accounts?.unauthorized)}</strong></div><div><span>Asset type</span><strong>{selected.asset_type}</strong></div></div>
          <div className="modal-warning"><ShieldCheck size={17} /><span>These metrics are on-chain indicators, not a safety rating. Verify issuers independently before interacting with any asset.</span></div>
          <div className="modal-actions"><button className="outline-button" onClick={() => void copyText(`${selected.asset_code || "XLM"}${selected.asset_issuer ? ":" + selected.asset_issuer : ""}`, "Asset identifier copied")}><Copy size={15} /> Copy identifier</button><a className="primary-button" href={assetUrl(selected)} target="_blank" rel="noreferrer">View on Stellar Expert <ExternalLink size={14} /></a></div>
        </section>
      </div>}
      {notice && notice.toLowerCase().includes("copied") && <div className="toast"><ArrowUpRight size={15} /> {notice}</div>}
    </div>
  );
}

export default App;
