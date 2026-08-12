// src/pages/BagManagement.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { Toast } from "primereact/toast";
import "../styles/BagManagement.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faCircleXmark,
} from "@fortawesome/free-solid-svg-icons";

const API_BASE = "http://10.240.112.35:5001/api";

const VALID_REASONS = [
  "NO_FLOW_MATCH",
  "AWB_NOT_FOUND",
  "NO_REGEX_MATCH",
  "NO_ACTIVE_CONFIG",
  "NO_BAG_MATCH",
  "REJECTED",
  // Meesho rejection codes
  "CFGR",
  "WULR",
  "DBAR",
  "WNRR",
  "DNFR",
  "CMRR",
  "LULR",
  "BGFR",
  "SPLR",
  "CLBR",
  "ZWRR",
  "CLDR",
  "DUPR",
  "LOLR",
  "IBAR",
  "BULR",
  "HOLR",
  "WVOR",
  "APBR",
];

const REASON_COLORS = {
  NO_FLOW_MATCH: { bg: "rgba(239,68,68,0.10)", color: "#f87171", border: "rgba(239,68,68,0.25)" },
  AWB_NOT_FOUND: { bg: "rgba(249,115,22,0.10)", color: "#fb923c", border: "rgba(249,115,22,0.25)" },
  NO_REGEX_MATCH: { bg: "rgba(234,179,8,0.10)", color: "#fbbf24", border: "rgba(234,179,8,0.25)" },
  NO_ACTIVE_CONFIG: { bg: "rgba(168,85,247,0.10)", color: "#c084fc", border: "rgba(168,85,247,0.25)" },
  NO_BAG_MATCH: { bg: "rgba(59,130,246,0.10)", color: "#60a5fa", border: "rgba(59,130,246,0.25)" },
  REJECTED: { bg: "rgba(16,185,129,0.10)", color: "#34d399", border: "rgba(16,185,129,0.25)" },
};

function ReasonTag({ reason }) {
  const c = REASON_COLORS[reason] || { bg: "rgba(100,116,139,0.1)", color: "#94a3b8", border: "rgba(100,116,139,0.25)" };
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: "5px",
      fontSize: "11px", fontWeight: 700, letterSpacing: "0.3px",
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>
      {reason}
    </span>
  );
}

// ─── Add / Edit Dialog ────────────────────────────────────────────────────────
function RejectionDialog({ visible, onHide, onSave, editingRow, existingMappings }) {
  const [bagCode, setBagCode] = useState("");
  const [reasons, setReasons] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setBagCode(editingRow ? editingRow.bag_code : "");
      setReasons(editingRow ? [editingRow.reason] : []);
      setError("");
    }
  }, [visible, editingRow]);

  // Reasons already taken by other bags
  const takenReasons = existingMappings
    .filter(m => !editingRow || m.id !== editingRow.id)
    .map(m => m.reason);

  const toggleReason = (r) => {
    if (editingRow) return;
    setReasons(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };

  const handleSave = async () => {
    if (!bagCode.trim()) { setError("Bag code is required"); return; }
    if (!editingRow && reasons.length === 0) { setError("Select at least one reason"); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ bag_code: bagCode.trim().toUpperCase(), reasons, editingRow });
      onHide();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="rm-overlay" onClick={onHide}>
      <div className="rm-dialog" onClick={e => e.stopPropagation()}>
        <div className="rm-dialog__header">
          <span>{editingRow ? "Change Bag for Reason" : "Add Rejection Mapping"}</span>
          <button className="rm-dialog__close" onClick={onHide}>✕</button>
        </div>

        <div className="rm-dialog__body">
          {/* Bag Code */}
          <div className="rm-field">
            <label className="rm-label">Bag Code</label>
            <input
              className="rm-input"
              value={bagCode}
              onChange={e => setBagCode(e.target.value.toUpperCase())}
              placeholder="e.g. D099"
            />
            <span className="rm-hint">Physical rejection bag chute (e.g. D099)</span>
          </div>

          {/* Reasons grid */}
          <div className="rm-field">
            <label className="rm-label">
              {editingRow ? "Reason (fixed — to change reason, delete and recreate)" : "Assign Reasons"}
            </label>
            <div className="rm-reasons-grid">
              {VALID_REASONS.map(r => {
                const taken = takenReasons.includes(r);
                const selected = reasons.includes(r);
                const isFixed = editingRow && r === editingRow.reason;
                return (
                  <button
                    key={r}
                    className={[
                      "rm-reason-btn",
                      selected ? "rm-reason-btn--sel" : "",
                      taken && !isFixed ? "rm-reason-btn--taken" : "",
                      isFixed ? "rm-reason-btn--fixed" : "",
                    ].join(" ")}
                    onClick={() => !taken && !editingRow && toggleReason(r)}
                    disabled={taken && !isFixed}
                    title={taken && !isFixed ? "Already assigned to another bag" : ""}
                  >
                    <ReasonTag reason={r} />
                    {taken && !isFixed && <span className="rm-taken-label">taken</span>}
                    {selected && !taken && <span className="rm-check">✓</span>}
                    {isFixed && <span className="rm-check rm-check--fixed">●</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <div className="rm-error">⚠️ {error}</div>}
        </div>

        <div className="rm-dialog__footer">
          <button className="rm-btn rm-btn--cancel" onClick={onHide}>Cancel</button>
          <button className="rm-btn rm-btn--save" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────
const BagManagement = () => {
  const toastRef = useRef(null);

  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [dialog, setDialog] = useState({
    open: false,
    message: "",
    type: "",
  });


  const fetchMappings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/rejection-mappings`);
      if (res.data.success) setMappings(res.data.rows);
    } catch {
      toastRef.current?.show({ severity: "error", summary: "Error", detail: "Failed to load rejection mappings" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMappings(); }, [fetchMappings]);
  // Group by bag_code
  const groupedByBag = mappings.reduce((acc, m) => {
    if (!acc[m.bag_code]) acc[m.bag_code] = [];
    acc[m.bag_code].push(m);
    return acc;
  }, {});

  const handleSave = async ({ bag_code, reasons, editingRow }) => {
    if (editingRow) {
      await axios.put(`${API_BASE}/rejection-mappings/${editingRow.id}`, { bag_code });
      toastRef.current?.show({ severity: "success", summary: "Updated", detail: `${editingRow.reason} → ${bag_code}` });
    } else {
      const response = await axios.get(`${API_BASE}/already-mapped-bag/${bag_code}`)
      const rows = response?.data?.rows || [];
      if (rows.length > 0) {
        const config_id = rows[0].config_id;

        setDialog({
          open: true,
          message: `Bag is already assigned for Sorting Process (config_id - ${config_id})`,
          type: "error",
        });
      }
      await axios.post(`${API_BASE}/rejection-mappings`, { bag_code, reasons });
      toastRef.current?.show({ severity: "success", summary: "Added", detail: `${reasons.length} reason(s) → ${bag_code}` });
    }
    fetchMappings();
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Remove "${row.reason}" from bag ${row.bag_code}?`)) return;
    try {
      await axios.delete(`${API_BASE}/rejection-mappings/${row.id}`);
      toastRef.current?.show({ severity: "success", summary: "Removed", detail: `${row.reason} unassigned` });
      fetchMappings();
    } catch (err) {
      toastRef.current?.show({ severity: "error", summary: "Error", detail: err.response?.data?.error || err.message });
    }
  };


  const CommonDialog = ({ isOpen, message, type, onClose }) => {
    if (!isOpen) return null;

    const isSuccess = type === "success";

    return (
      <div className="common-dialog-overlay">
        <div className="common-dialog-box">
          <div className="common-icon-container">
            <FontAwesomeIcon
              icon={isSuccess ? faCircleCheck : faCircleXmark}
              size="4x"
              color={isSuccess ? "#22c55e" : "#ef4444"}
            />
            <h3>{isSuccess ? "Success" : "Error"}</h3>
          </div>

          <p style={{
            marginBottom: "1rem", fontWeight: "600", letterSpacing: "1px", background: "beige",
            marginTop: "43px"
          }}>{message}</p>
          <div className="d-flex mt-5">
            <button onClick={onClose} className="common-dialog-btn ms-auto">
              OK
            </button>
          </div>
        </div>
      </div>
    );
  };



  const assignedReasons = mappings.map(m => m.reason);
  const unassignedReasons = VALID_REASONS.filter(r => !assignedReasons.includes(r));

  return (
    <div className="bm-page">
      <Toast ref={toastRef} />

      {/* ── Header ── */}
      <div className="bm-header">
        <div>
          <h1 className="bm-title">Rejection Bag Mapping</h1>
          <p className="bm-subtitle">Assign sort exception reasons to physical rejection bags</p>
        </div>
        <div className="bm-header-actions">
          <button className="bm-btn-refresh-plain" onClick={fetchMappings}>↻ Refresh</button>
          <button className="bm-btn-new" onClick={() => { setEditingRow(null); setDialogOpen(true); }}>
            + Add Mapping
          </button>
        </div>
      </div>

      {/* ── Summary ── */}
      <div className="rm-summary-row">
        <div className="rm-summary-card">
          <span className="rm-summary-card__num">{mappings.length}</span>
          <span className="rm-summary-card__lbl">Assigned Reasons</span>
        </div>
        <div className="rm-summary-card">
          <span className="rm-summary-card__num">{Object.keys(groupedByBag).length}</span>
          <span className="rm-summary-card__lbl">Rejection Bags</span>
        </div>
        <div className={`rm-summary-card ${unassignedReasons.length > 0 ? "rm-summary-card--warn" : "rm-summary-card--ok"}`}>
          <span className="rm-summary-card__num">{unassignedReasons.length}</span>
          <span className="rm-summary-card__lbl">Unassigned Reasons</span>
        </div>
      </div>

      {/* ── Unassigned warning ── */}
      {unassignedReasons.length > 0 && (
        <div className="rm-unassigned-warn">
          <span style={{ fontSize: "medium", fontStretch: "expanded", color: "#954f0afa" }}>⚠️ These reasons have no bag — exceptions fall back to <b>D099</b>:</span>
          <div className="rm-unassigned-tags">
            {unassignedReasons.map(r => <ReasonTag key={r} reason={r} />)}
          </div>
        </div>
      )}

      {/* ── Bag cards ── */}
      {loading ? (
        <div className="rm-loading">Loading…</div>
      ) : Object.keys(groupedByBag).length === 0 ? (
        <div className="rm-empty">
          No rejection mappings configured yet.<br />
          Click <b>"+ Add Mapping"</b> to assign reasons to bags.
        </div>
      ) : (
        <div className="rm-bag-grid">
          {Object.entries(groupedByBag)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([bagCode, rows]) => (
              <div key={bagCode} className="rm-bag-card">
                <div className="rm-bag-card__header">
                  <span className="rm-bag-tag">{bagCode}</span>
                  <span className="rm-bag-card__count">
                    {rows.length} reason{rows.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="rm-bag-card__reasons" style={{
                  maxHeight: "500px",
                  height: "350px",
                  overflowY: "auto",
                  overflowX: "hidden",
                  color: "red"
                }}>
                  {rows.map(row => (
                    <div key={row.id} className="rm-reason-row">
                      <ReasonTag reason={row.reason} />
                      <div className="rm-reason-row__actions">
                        <button
                          className="rm-icon-btn rm-icon-btn--edit"
                          title="Change bag for this reason"
                          onClick={() => { setEditingRow(row); setDialogOpen(true); }}
                        >✏️</button>
                        <button
                          className="rm-icon-btn rm-icon-btn--del"
                          title="Remove this reason mapping"
                          onClick={() => handleDelete(row)}
                        >🗑</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rm-bag-card__footer">
                  Last updated {new Date(rows[rows.length - 1].updated_at)
                    .toLocaleString("en-GB", {
                      timeZone: "Asia/Kolkata",
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit", hour12: false,
                    })}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ── Dialog ── */}
      <RejectionDialog
        visible={dialogOpen}
        onHide={() => setDialogOpen(false)}
        onSave={handleSave}
        editingRow={editingRow}
        existingMappings={mappings}
      />

      <CommonDialog
        isOpen={dialog.open}
        message={dialog.message}
        type={dialog.type}
        onClose={() =>
          setDialog((prev) => ({
            ...prev,
            open: false,
          }))
        }
      />
    </div>
  );
};

export default BagManagement;