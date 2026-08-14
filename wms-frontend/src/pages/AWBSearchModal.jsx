import React, { useState, useRef, useEffect } from "react";
import "../styles/AWBSearchModal.css";
import { useMachine } from "../context/MachineContext";

const API = "http://localhost:5001/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtIST(utcStr) {
  if (!utcStr) return "—";
  try {
    return new Date(utcStr).toLocaleString("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch { return utcStr; }
}

function val(v) {
  if (v === null || v === undefined || v === "") return "—";
  return v;
}

// ─── Fetch single AWB — parcels (primary_bin_data) ONLY ───────────────────────
// Production report and sort events were removed — this now only queries
// /parcels, and every field shown comes from that one source.

async function fetchAWBData(wbn, machine_id) {
  const results = { parcel: null, errors: [] };

  try {
    const r = await fetch(
      `${API}/parcels?search=${encodeURIComponent(wbn)}&limit=1&machine_id=${encodeURIComponent(machine_id)}`
    );
    const d = await r.json();
    if (d.rows && d.rows.length > 0) results.parcel = d.rows[0];
    else results.errors.push("No parcel record found");
  } catch (e) {
    results.errors.push("Parcels API error: " + e.message);
  }

  return results;
}

// ─── Results Table ─────────────────────────────────────────────────────────────
// Columns: awb, item_id, expected_bag, final_bag, machine_id, reason,
// status, created_at — all sourced from /parcels only.

function ResultsTable({ results }) {
  const [detailsOpen, setDetailsOpen] = useState(null); // index of expanded row

  return (
    <div className="awb-results">
      <table className="awb-results-table">
        <thead>
          <tr>
            <th>#</th>
            <th>AWB</th>
            <th>Item ID</th>
            <th>Expected Bag</th>
            <th>Final Bag</th>
            <th>Machine ID</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Created (IST)</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            if (r.loading) {
              return (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td colSpan={9}>
                    <div className="awb-result-card__loading" style={{ padding: "8px 0" }}>
                      <div className="awb-spinner awb-spinner--sm" />
                      <span>Fetching data for <b>{r.wbn}</b>…</span>
                    </div>
                  </td>
                </tr>
              );
            }

            const p = r.data?.parcel;
            const notFound = r.error || !p;

            if (notFound) {
              return (
                <tr key={i} className="awb-row--error">
                  <td>{i + 1}</td>
                  <td>{r.wbn}</td>
                  <td colSpan={8}>
                    ⚠️ {r.error || "No parcel record found."}
                  </td>
                </tr>
              );
            }

            const awb          = val(p?.wbn || r.wbn);
            const item_id       = val(p?.item_id);
            const expected_bag  = val(p?.expected_bag);
            const final_bag     = val(p?.final_bag);
            const machine_id    = val(p?.machine_id);
            const reason        = p?.reason;
            const status        = p?.sort;
            const created_at    = fmtIST(p?.created_at);

            const isOpen = detailsOpen === i;

            return (
              <React.Fragment key={i}>
                <tr>
                  <td>{i + 1}</td>
                  <td>{awb}</td>
                  <td>{item_id}</td>
                  <td>{expected_bag !== "—" ? <span className="awb-bag-tag">{expected_bag}</span> : "—"}</td>
                  <td>{final_bag !== "—" ? <span className="awb-bag-tag awb-bag-tag--final">{final_bag}</span> : "—"}</td>
                  <td>{machine_id}</td>
                  <td>{reason ? <span className="awb-reason-tag">{reason.toUpperCase()}</span> : "—"}</td>
                  <td>
                    {status === "SORTED" && <span className="awb-badge awb-badge--sorted">SORTED</span>}
                    {status === "REJECTED" && <span className="awb-badge awb-badge--rej">REJECTED</span>}
                    {status && status !== "SORTED" && status !== "REJECTED" && <span>{status}</span>}
                    {!status && "—"}
                  </td>
                  <td>{created_at}</td>
                  <td>
                    <button
                      className="awb-json-btn"
                      onClick={() => setDetailsOpen(isOpen ? null : i)}
                    >
                      {isOpen ? "▲ Hide" : "▼ More"}
                    </button>
                  </td>
                </tr>

                {isOpen && (
                  <tr className="awb-row--details">
                    <td colSpan={10}>
                      <div className="awb-details-panel">
                        <div className="awb-details-section">
                          <div className="awb-section__title">📦 Parcel Data</div>
                          <div className="awb-fields">
                            <div className="awb-field"><span className="awb-field__lbl">Weight (g)</span><span className="awb-field__val">{val(p?.weight)}</span></div>
                            <div className="awb-field"><span className="awb-field__lbl">L (cm)</span><span className="awb-field__val">{val(p?.length)}</span></div>
                            <div className="awb-field"><span className="awb-field__lbl">B (cm)</span><span className="awb-field__val">{val(p?.width)}</span></div>
                            <div className="awb-field"><span className="awb-field__lbl">H (cm)</span><span className="awb-field__val">{val(p?.height)}</span></div>
                            <div className="awb-field"><span className="awb-field__lbl">Volume</span><span className="awb-field__val">{val(p?.volume)}</span></div>
                            <div className="awb-field"><span className="awb-field__lbl">Real Volume</span><span className="awb-field__val">{val(p?.real_volume)}</span></div>
                            <div className="awb-field"><span className="awb-field__lbl">Scan Time</span><span className="awb-field__val">{fmtIST(p?.scantime)}</span></div>
                            <div className="awb-field"><span className="awb-field__lbl">Sort Time</span><span className="awb-field__val">{fmtIST(p?.sorttime)}</span></div>
                          </div>
                        </div>

                        {p?.imagepath && p.imagepath !== "image_missing" && (
                          <div className="awb-image-row">
                            <span className="awb-payload-item__lbl">Parcel Image</span>
                            <a href={`http://localhost:5001${p.imagepath}`} target="_blank" rel="noreferrer" className="awb-json-btn">
                              🖼 View Image
                            </a>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Modal Component ─────────────────────────────────────────────────────

export default function AWBSearchModal({ onClose }) {
  // Selected machine — global state from Navbar's dropdown. Required by
  // /parcels.
  const { selectedMachine } = useMachine();

  const [tab, setTab] = useState("single"); // "single" | "multiple"

  // Single
  const [singleInput, setSingleInput] = useState("");
  const [singleResults, setSingleResults] = useState([]); // array of one, for shared table renderer
  const [singleLoading, setSingleLoading] = useState(false);
  const singleRef = useRef(null);

  // Multiple
  const [multiInput, setMultiInput] = useState("");
  const [multiResults, setMultiResults] = useState([]); // [{wbn, data, loading, error}]
  const [multiLoading, setMultiLoading] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Single search ────────────────────────────────────────────────────────
  const handleSingleSearch = async () => {
    const wbn = singleInput.trim();
    if (!wbn || !selectedMachine) return;
    setSingleLoading(true);
    setSingleResults([{ wbn, data: null, loading: true, error: null }]);
    const data = await fetchAWBData(wbn, selectedMachine);
    setSingleLoading(false);
    const error = !data.parcel ? "No parcel record found for this AWB." : null;
    setSingleResults([{ wbn, data, loading: false, error }]);
  };

  const handleSingleKeyDown = (e) => {
    if (e.key === "Enter") handleSingleSearch();
  };

  // ── Multiple search ──────────────────────────────────────────────────────
  const handleMultiSearch = async () => {
    if (!selectedMachine) return;

    const lines = multiInput
      .split(/[\n,\s]+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (!lines.length) return;

    // Init all as loading
    setMultiResults(lines.map(wbn => ({ wbn, data: null, loading: true, error: null })));
    setMultiLoading(true);

    // Fetch all concurrently
    const settled = await Promise.allSettled(lines.map(wbn => fetchAWBData(wbn, selectedMachine)));

    setMultiResults(lines.map((wbn, i) => {
      const res = settled[i];
      if (res.status === "fulfilled") {
        const data = res.value;
        const error = !data.parcel ? "No parcel record found." : null;
        return { wbn, data, loading: false, error };
      } else {
        return { wbn, data: null, loading: false, error: res.reason?.message || "Fetch failed" };
      }
    }));

    setMultiLoading(false);
  };

  return (
    <div className="awb-overlay" onClick={onClose}>
      <div className="awb-modal" onClick={e => e.stopPropagation()}>

        {/* ── Modal Header ── */}
        <div className="awb-modal__header">
          <div className="awb-modal__header-left">
            <span className="awb-modal__header-icon">🔍</span>
            <span className="awb-modal__title">Search Shipments</span>
            {selectedMachine && <span className="awb-badge awb-badge--mode">{selectedMachine.toUpperCase()}</span>}
          </div>
          <button className="awb-modal__close" onClick={onClose}>✕</button>
        </div>

        {/* ── Tabs ── */}
        <div className="awb-tabs">
          <button
            className={`awb-tab ${tab === "single" ? "awb-tab--active" : ""}`}
            onClick={() => setTab("single")}
          >
            Single AWB Search
          </button>
          <button
            className={`awb-tab ${tab === "multiple" ? "awb-tab--active" : ""}`}
            onClick={() => setTab("multiple")}
          >
            Multiple AWB Search
          </button>
        </div>

        <div className="awb-modal__body">

          {/* ── Single Tab ── */}
          {tab === "single" && (
            <div className="awb-single">
              <div className="awb-single__search-row">
                <div className="awb-single__input-wrap">
                  <span className="awb-single__search-icon">📦</span>
                  <input
                    ref={singleRef}
                    className="awb-single__input"
                    placeholder="Enter AWB / WBN number…"
                    value={singleInput}
                    onChange={e => setSingleInput(e.target.value)}
                    onKeyDown={handleSingleKeyDown}
                    autoFocus
                  />
                  {singleInput && (
                    <button className="awb-single__clear"
                      onClick={() => { setSingleInput(""); setSingleResults([]); }}>
                      ✕
                    </button>
                  )}
                </div>
                <button
                  className="awb-single__search-btn"
                  onClick={handleSingleSearch}
                  disabled={!singleInput.trim() || singleLoading || !selectedMachine}
                >
                  {singleLoading ? <span className="awb-spinner awb-spinner--sm" /> : "🔍"} Search
                </button>
                {singleResults.length > 0 && (
                  <button className="awb-single__clear-btn"
                    onClick={() => { setSingleResults([]); setSingleInput(""); }}>
                    ↺ Clear
                  </button>
                )}
              </div>

              <p className="awb-hint">Press Enter or click Search. Searches the Parcels table for {selectedMachine ? selectedMachine.toUpperCase() : "the selected machine"}.</p>

              {/* Result */}
              {singleResults.length > 0 && <ResultsTable results={singleResults} />}
            </div>
          )}

          {/* ── Multiple Tab ── */}
          {tab === "multiple" && (
            <div className="awb-multi">
              <label className="awb-multi__label">
                Enter AWB numbers — one per line, or comma/space separated:
              </label>
              <textarea
                className="awb-multi__textarea"
                placeholder={"142285182454214\n149082791932314\n165892743001..."}
                value={multiInput}
                onChange={e => setMultiInput(e.target.value)}
                rows={5}
              />
              <div className="awb-multi__actions">
                <span className="awb-multi__count">
                  {multiInput.split(/[\n,\s]+/).filter(Boolean).length} AWBs entered
                </span>
                <button
                  className="awb-single__clear-btn"
                  onClick={() => { setMultiInput(""); setMultiResults([]); }}
                >
                  ↺ Clear
                </button>
                <button
                  className="awb-single__search-btn"
                  onClick={handleMultiSearch}
                  disabled={!multiInput.trim() || multiLoading || !selectedMachine}
                >
                  {multiLoading ? <span className="awb-spinner awb-spinner--sm" /> : "🔍"} Search All
                </button>
              </div>

              {multiResults.length > 0 && <ResultsTable results={multiResults} />}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
