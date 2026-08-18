import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Toast } from "primereact/toast";
import "../styles/Parcels.css";
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimesCircle,
} from "react-icons/fa";
import { useMachine } from "../context/MachineContext";
const API = "http://localhost:5001/api";

// ─── IST helpers ──────────────────────────────────────────────────────────────

function nowIST() {
  const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth() + 1)}-${p(ist.getUTCDate())}T${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}`;
}
function todayMidnightIST() {
  const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth() + 1)}-${p(ist.getUTCDate())}T00:00`;
}
function todayEndIST() {
  const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth() + 1)}-${p(ist.getUTCDate())}T23:59`;
}
function subtractHoursFromNow(h) {
  const shifted = new Date(new Date().getTime() - h * 60 * 60 * 1000);
  const ist = new Date(shifted.getTime() + 5.5 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth() + 1)}-${p(ist.getUTCDate())}T${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}`;
}
function yesterdayRangeIST() {
  const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  const y = new Date(ist.getTime() - 24 * 60 * 60 * 1000);
  const date = `${y.getUTCFullYear()}-${p(y.getUTCMonth() + 1)}-${p(y.getUTCDate())}`;
  return { start: `${date}T00:00`, end: `${date}T23:59` };
}
function istLocalToUTC(s) {
  return new Date(s + ":00+05:30").toISOString();
}
function fmtIST(utcStr) {
  if (!utcStr) return "—";
  return new Date(utcStr).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

// ─── Quick range presets ──────────────────────────────────────────────────────

const QUICK_RANGES = [
  { label: "Last 24 Hours", icon: "🕐", getRange: () => ({ start: subtractHoursFromNow(24), end: nowIST() }) },
  { label: "Last 48 Hours", icon: "🕑", getRange: () => ({ start: subtractHoursFromNow(48), end: nowIST() }) },
  { label: "Last 72 Hours", icon: "🕒", getRange: () => ({ start: subtractHoursFromNow(72), end: nowIST() }) },
  { label: "Today",         icon: "📅", getRange: () => ({ start: todayMidnightIST(), end: todayEndIST() }) },
  { label: "Yesterday",     icon: "📆", getRange: () => yesterdayRangeIST() },
  { label: "Last 2 Days",   icon: "🗓", getRange: () => ({ start: subtractHoursFromNow(48), end: todayEndIST() }) },
  { label: "Last 3 Days",   icon: "📋", getRange: () => ({ start: subtractHoursFromNow(72), end: todayEndIST() }) },
];

// ─── Compact date-time picker (same as dashboard) ─────────────────────────────

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_SHORT   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function parseIST(str) {
  if (!str) return null;
  const [date, time] = str.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = (time || "00:00").split(":").map(Number);
  return { year, month: month - 1, day, hour, minute };
}
function toISTStr({ year, month, day, hour, minute }) {
  const p = (n) => String(n).padStart(2, "0");
  return `${year}-${p(month + 1)}-${p(day)}T${p(hour)}:${p(minute)}`;
}
function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y, m)    { return new Date(y, m, 1).getDay(); }

function SpinBox({ value, min, max, onChange, color, width = 52 }) {
  const p = (n) => String(n).padStart(2, "0");
  const inc = () => onChange(value >= max ? min : value + 1);
  const dec = () => onChange(value <= min ? max : value - 1);
  return (
    <div className="pr-spb" style={{ width }} tabIndex={0}
      onKeyDown={e => { if (e.key === "ArrowUp") { e.preventDefault(); inc(); } if (e.key === "ArrowDown") { e.preventDefault(); dec(); } }}>
      <button className="pr-spb__arrow" onClick={inc} tabIndex={-1}>▲</button>
      <div className="pr-spb__val" style={{ color, borderColor: color + "80" }}>{p(value)}</div>
      <button className="pr-spb__arrow" onClick={dec} tabIndex={-1}>▼</button>
    </div>
  );
}

function DateTimePicker({ label, color, value, onChange }) {
  const fallback = () => {
    const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
    return { year: ist.getUTCFullYear(), month: ist.getUTCMonth(), day: ist.getUTCDate(), hour: 0, minute: 0 };
  };
  const init = parseIST(value) || fallback();
  const [view, setView] = useState({ year: init.year, month: init.month });
  const [sel,  setSel ] = useState(init);
  const lastEmitted = useRef(null);

  useEffect(() => {
    if (value && value !== lastEmitted.current) {
      const p = parseIST(value);
      if (p) { setSel(p); setView({ year: p.year, month: p.month }); }
    }
  }, [value]);

  const emit = (next) => {
    setSel(next);
    const str = toISTStr(next);
    lastEmitted.current = str;
    onChange(str);
  };

  const prevM = () => setView(v => v.month === 0  ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  const nextM = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0  } : { ...v, month: v.month + 1 });

  const days = getDaysInMonth(view.year, view.month);
  const firstDay = getFirstDay(view.year, view.month);
  const cells = Array.from({ length: firstDay + days }, (_, i) => i < firstDay ? null : i - firstDay + 1);
  while (cells.length % 7 !== 0) cells.push(null);

  const istNow  = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const isToday = d => d && istNow.getUTCDate() === d && istNow.getUTCMonth() === view.month && istNow.getUTCFullYear() === view.year;
  const isSel   = d => d && sel.day === d && sel.month === view.month && sel.year === view.year;

  return (
    <div className="pr-dtp">
      <div className="pr-dtp__label" style={{ color }}>
        <span className="pr-dtp__dot" style={{ background: color }} />
        {label}
      </div>
      <div className="pr-dtp__body">
        <div className="pr-dtp__cal">
          <div className="pr-dtp__nav">
            <button className="pr-dtp__navbtn" onClick={prevM}>‹</button>
            <span className="pr-dtp__navtitle">{MONTHS_SHORT[view.month]} {view.year}</span>
            <button className="pr-dtp__navbtn" onClick={nextM}>›</button>
          </div>
          <div className="pr-dtp__dayhdr">
            {DAYS_SHORT.map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="pr-dtp__grid">
            {cells.map((d, i) => (
              <button key={i} disabled={!d}
                className={["pr-dtp__cell",
                  !d       ? "pr-dtp__cell--blank" : "",
                  isSel(d) ? "pr-dtp__cell--sel"   : "",
                  isToday(d) && !isSel(d) ? "pr-dtp__cell--today" : "",
                ].join(" ")}
                style={isSel(d) ? { background: color, borderColor: color } : {}}
                onClick={() => d && emit({ ...sel, year: view.year, month: view.month, day: d })}
              >{d || ""}</button>
            ))}
          </div>
        </div>
        <div className="pr-dtp__time">
          <div className="pr-dtp__time-title">TIME</div>
          <div className="pr-dtp__time-hint">24h IST</div>
          <div className="pr-dtp__spinrow">
            <SpinBox value={sel.hour}   min={0} max={23} onChange={h => emit({ ...sel, hour: h })}   color={color} />
            <span className="pr-dtp__colon">:</span>
            <SpinBox value={sel.minute} min={0} max={59} onChange={m => emit({ ...sel, minute: m })} color={color} />
          </div>
          <div className="pr-dtp__timedisp" style={{ color, borderColor: color + "50" }}>
            {String(sel.hour).padStart(2, "0")}:{String(sel.minute).padStart(2, "0")}
          </div>
          <div className="pr-dtp__datedisp">
            {String(sel.day).padStart(2, "0")} {MONTHS_SHORT[sel.month]} {sel.year}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Filter Drawer ────────────────────────────────────────────────────────────

function FilterDrawer({ open, onClose, dateRange, onApplyDate, onQuickSelect, activeLabel }) {
  const [tab, setTab]   = useState("quick");
  const [start, setStart] = useState(dateRange.start || todayMidnightIST());
  const [end,   setEnd  ] = useState(dateRange.end   || todayEndIST());

  const prevStart = useRef(dateRange.start);
  const prevEnd   = useRef(dateRange.end);
  useEffect(() => {
    if (dateRange.start !== prevStart.current || dateRange.end !== prevEnd.current) {
      prevStart.current = dateRange.start;
      prevEnd.current   = dateRange.end;
      if (dateRange.start) setStart(dateRange.start);
      if (dateRange.end)   setEnd(dateRange.end);
    }
  }, [dateRange.start, dateRange.end]);

  const diffMs = start && end ? new Date(end + ":00+05:30") - new Date(start + ":00+05:30") : 0;
  const hrs  = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);

  return (
    <>
      <div className={`pr-drawer-backdrop ${open ? "pr-drawer-backdrop--open" : ""}`} onClick={onClose} />
      <div className={`pr-filter-drawer ${open ? "pr-filter-drawer--open" : ""}`}>

        <div className="pr-fd-header">
          <div className="pr-fd-header__left">
            <span style={{ fontSize: 20 }}>🔍</span>
            <div>
              <div className="pr-fd-header__title">Date &amp; Time Filter</div>
              <div className="pr-fd-header__sub">All times shown in IST</div>
            </div>
          </div>
          <button className="pr-fd-close" onClick={onClose}>✕</button>
        </div>

        <div className="pr-fd-tabs">
          <button className={`pr-fd-tab ${tab === "quick"  ? "pr-fd-tab--active" : ""}`} onClick={() => setTab("quick")}>⚡ Quick</button>
          <button className={`pr-fd-tab ${tab === "custom" ? "pr-fd-tab--active" : ""}`} onClick={() => setTab("custom")}>🗓 Custom</button>
        </div>

        <div className="pr-fd-body">
          {tab === "quick" && (
            <div>
              <p className="pr-fd-section-label">Select preset range</p>
              <div className="pr-fd-quick-grid">
                {QUICK_RANGES.map(r => {
                  const isActive = activeLabel === r.label;
                  return (
                    <button key={r.label}
                      className={`pr-fd-preset ${isActive ? "pr-fd-preset--active" : ""}`}
                      onClick={() => { onQuickSelect(r.label, r.getRange()); onClose(); }}
                    >
                      <span style={{ fontSize: 15 }}>{r.icon}</span>
                      <span className="pr-fd-preset__label">{r.label}</span>
                      {isActive && <span style={{ color: "#60a5fa", fontSize: 11 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "custom" && (
            <div className="pr-fd-custom">
              <DateTimePicker label="Start" color="#3b82f6" value={start} onChange={setStart} />
              <div style={{ height: 1, background: "#1e2740", margin: "6px 0 10px" }} />
              <DateTimePicker label="End"   color="#f97316" value={end}   onChange={setEnd} />

              {diffMs > 0
                ? <div className="pr-fd-duration">⏱ Duration: <b>{hrs}h {mins}m</b></div>
                : start && end && <div className="pr-fd-duration pr-fd-duration--warn">⚠️ End must be after Start</div>
              }
              <button className="pr-fd-apply-btn"
                onClick={() => { if (diffMs > 0) { onApplyDate(start, end); onClose(); } }}>
                Apply Range
              </button>
            </div>
          )}
        </div>

        <div className="pr-fd-footer">
          <div className="pr-fd-footer__label">Currently showing</div>
          <div className="pr-fd-footer__range">
            {activeLabel
              ? <span className="pr-fd-footer__badge">{activeLabel}</span>
              : <span style={{ fontSize: 11 }}>{dateRange.start?.replace("T", " ")} → {dateRange.end?.replace("T", " ")} IST</span>
            }
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function FilterChip({ label, value, onRemove }) {
  if (!value) return null;
  return (
    <span className="pr-chip">
      <span className="pr-chip__label">{label}:</span>
      <span className="pr-chip__val">{value}</span>
      <button className="pr-chip__x" onClick={onRemove}>✕</button>
    </span>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODE_OPTIONS   = ["auto", "semi", "hhd"];
const SORT_OPTIONS   = ["SORTED", "REJECTED"];
const REASON_OPTIONS = [ "CHUTESENSORFULL","CHUTE_BLOCKED","LABEL_NO_MATCH","EMPTY_SORT_CODE","NO_CHUTE_MATCH","API_ERROR","SABP",];

// ─── Main component ───────────────────────────────────────────────────────────

const Parcels = () => {
  const toastRef = useRef(null);

  // Selected machine — global state from Navbar's dropdown.
  const { selectedMachine } = useMachine();

  const [rows,    setRows   ] = useState([]);
  const [total,   setTotal  ] = useState(0);
  const [page,    setPage   ] = useState(1);
  const [limit,   setLimit  ] = useState(100);
  const [loading, setLoading] = useState(false);

  // Search & field filters
  const [wbnInput,    setWbnInput   ] = useState("");
  // const [modeFilter,  setModeFilter ] = useState("");
  const [sortFilter,  setSortFilter ] = useState("");
  const [reasonFilter,setReasonFilter] = useState("");


  // The search that was actually sent to the API
  const [appliedSearch, setAppliedSearch] = useState("");

  // Date range
  const [dateRange,   setDateRange  ] = useState({ start: null, end: null });
  const [activeLabel, setActiveLabel] = useState(null);
  const [drawerOpen,  setDrawerOpen ] = useState(false);
    const [showDimensions, setShowDimensions] = useState(false);

  // Image viewer
  const [imgSrc, setImgSrc] = useState(null);

  const debounceRef = useRef(null);
  const [searchTrigger, setSearchTrigger] = useState(0);
    // JSON viewer
    const [jsonDialog, setJsonDialog] = useState(false);
    const [jsonData,   setJsonData  ] = useState(null);
    const [jsonTitle,  setJsonTitle ] = useState("");
    

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (overrides = {}) => {
    if (!selectedMachine) return; // wait until the machine list has loaded

    setLoading(true);
    try {
      const p = {
        page,
        limit,
        machine_id: selectedMachine,
        ...overrides,
      };

      // Add search param
      const searchVal = overrides.search !== undefined ? overrides.search : appliedSearch;
      if (searchVal) {
        p.search = searchVal;
        // API rejects search + date together
        delete p.startTime;
        delete p.endTime;
      } else if (dateRange.start && dateRange.end) {
        p.startTime = dateRange.start.replace("T", " ") + ":00";
        p.endTime   =  dateRange.end.replace("T", " ") + ":00";
      }

      // Clean empty values
      Object.keys(p).forEach(k => {
        if (p[k] === "" || p[k] == null) delete p[k];
      });

      const res = await axios.get(`${API}/parcels`, { params: p });
      setRows(res.data.rows);
      setTotal(res.data.total);
    } catch (err) {
      toastRef.current?.show({
        severity: "error", summary: "Error",
        detail: err.response?.data?.message || err.message, life: 3000,
      });
    } finally {
      setLoading(false);
    }
  }, [page, limit, appliedSearch, dateRange, searchTrigger, selectedMachine]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── WBN debounced partial search (fires at 2+ chars) ─────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (wbnInput.length >= 2) {
      debounceRef.current = setTimeout(() => {
        setAppliedSearch(wbnInput);
        setPage(1);
        // Clear date when searching WBN — API doesn't allow both
        setDateRange({ start: null, end: null });
        setActiveLabel(null);
      }, 500);
    } else if (wbnInput.length === 0 && appliedSearch) {
      setAppliedSearch("");
      setDateRange({ start: null, end: null });
      setActiveLabel(null);
      setPage(1);
    }
    return () => clearTimeout(debounceRef.current);
  }, [wbnInput]);

  // ── Date handlers ─────────────────────────────────────────────────────────
  const handleApplyDate = (start, end) => {
    const dr = { start, end };
    setDateRange(dr);
    setActiveLabel(null);
    setWbnInput("");
    setAppliedSearch("");
    setPage(1);
  };

  const handleQuickSelect = (label, { start, end }) => {
    const dr = { start, end };
    setDateRange(dr);
    setActiveLabel(label);
    setWbnInput("");
    setAppliedSearch("");
    setPage(1);
  };

  const handleReset = () => {
    setWbnInput("");
    setAppliedSearch("");
    // setModeFilter("");
    setSortFilter("");
    setReasonFilter("");
    setDateRange({ start: null, end: null });
    setActiveLabel(null);
    setPage(1);
  };
  const openJson = (data, title) => {
    setJsonData(data);
    setJsonTitle(title);
    setJsonDialog(true);
  };
  // ── Export ────────────────────────────────────────────────────────────────
const exportData = () => {
  const params = new URLSearchParams();

  if (selectedMachine) {
    params.append("machine_id", selectedMachine);
  }

  if (appliedSearch) {
    params.append("search", appliedSearch);
  }

  if (sortFilter) {
    params.append("sort", sortFilter);
  }

  if (reasonFilter) {
    params.append("reason", reasonFilter);
  }

  if (dateRange.start && dateRange.end) {
    params.append(
      "startTime",
      dateRange.start.replace("T", " ") + ":00"
    );

    params.append(
      "endTime",
      dateRange.end.replace("T", " ") + ":00"
    );
  }

  window.open(
    `${API}/parcels/export?${params.toString()}`,
    "_blank"
  );
};

  // ── Client-side field filtering (mode / sort / reason) ───────────────────
  const filteredRows = rows.filter(r => {
    // if (modeFilter   && (r.mode   || "").toLowerCase() !== modeFilter.toLowerCase())   return false;
    if (sortFilter   && (r.sort   || "").toUpperCase() !== sortFilter.toUpperCase())   return false;
    if (reasonFilter && (r.reason || "").toLowerCase() !== reasonFilter.toLowerCase()) return false;
    return true;
  });

  // ── Active chips ──────────────────────────────────────────────────────────
  const chips = [
    wbnInput      && { key: "wbn",    label: "WBN",    value: `"${wbnInput}"`,    clear: () => setWbnInput("") },
    // modeFilter    && { key: "mode",   label: "Mode",   value: modeFilter,         clear: () => setModeFilter("") },
    sortFilter    && { key: "sort",   label: "Status", value: sortFilter,         clear: () => setSortFilter("") },
    reasonFilter  && { key: "reason", label: "Reason", value: reasonFilter.toUpperCase(), clear: () => setReasonFilter("") },
    !wbnInput && (activeLabel || dateRange.start) && {
      key: "date", label: "Range",
      value: activeLabel || `${dateRange.start?.replace("T"," ")} → ${dateRange.end?.replace("T"," ")}`,
      clear: handleReset,
    },
  ].filter(Boolean);

  // ── Column templates ──────────────────────────────────────────────────────
  const sortBadge = (r) => {
    const s = r.sort || "—";
    return <span className={`pr-badge ${s === "SORTED" ? "pr-badge-sorted" : s === "REJECTED" ? "pr-badge-rej" : ""}`}>{s}</span>;
  };
  const modeBadge = (r) => {
    const m = (r.mode || "").toLowerCase();
    return <span className={`pr-badge ${m === "auto" ? "pr-badge-auto" : m === "semi" ? "pr-badge-semi" : m === "hhd" ? "pr-badge-hhd" : ""}`}>{r.mode || "—"}</span>;
  };
  const imageBtn = (r) => {
    if (!r.imagepath || r.imagepath === "image_missing") return <span className="pr-cell-muted">—</span>;
    return (
      <button className="pr-img-btn"
        onClick={() => setImgSrc(`http://localhost:5001${r.imagepath}`)}>
        🖼
      </button>
    );
  };
    // ── JSON button ──────────────────────────────────────────────────────────
  const jsonBtn = (data, title) => {
    if (!data) return <span className="bs-cell-muted">—</span>;
    return (
      <button className="bs-json-btn" onClick={() => openJson(data, title)} title={`View ${title}`}>
        👁 View
      </button>
    );
  };
  const resultTemplate = (row) => {
  const value = row.sort?.toLowerCase();

  const config = {
    sorted: {
      icon: <FaCheckCircle />,
      className: "badge-sorted",
      label: "Sorted",
    },
    exception: {
      icon: <FaExclamationTriangle />,
      className: "badge-exception",
      label: "Exception",
    },
    rejected: {
      icon: <FaTimesCircle />,
      className: "badge-rejected",
      label: "Rejected",
    },
  };

    const item = config[value] || {
    icon: <FaTimesCircle />,
    className: "badge-rejected",
    label: row.sort || "—",
  };


  return (
    <span className={`badge ${item.className}`}>
      <span className="badge-content">
        <span className="badge-icon">{item.icon}</span>
        <span className="badge-text">{item.label}</span>
      </span>
    </span>
  );
};

  const badgeText = activeLabel || (dateRange.start ? `${dateRange.start.replace("T"," ")} → ${dateRange.end?.replace("T"," ")}` : null);
  var dimensionColumns = [
    {
        field: "weight",
        header: "Wt (g)",
        width: 80,
    },
    {
        field: "length",
        header: "L",
        width: 55,
    },
    {
        field: "width",
        header: "W",
        width: 55,
    },
    {
        field: "height",
        header: "H",
        width: 55,
    },
    {
        field: "volume",
        header: "Volume",
        width: 80,
    },
    {
        field: "real_volume",
        header: "Real Vol",
        width: 80,
    }
];
  return (
    <div className="pr-root">
      <Toast ref={toastRef} />

      <div className="pr-card">

        {/* ── Header ── */}
        <div className="pr-page-header">
          <div className="pr-page-header__left">
            <h2 className="pr-page-title">Parcels Report</h2>
            {!wbnInput && badgeText && <span className="pr-range-badge">{badgeText}</span>}
            {wbnInput && <span className="pr-range-badge pr-range-badge--search">🔍 "{wbnInput}"</span>}
          </div>
          <span className="pr-total-count">
            {filteredRows.length !== rows.length
              ? `${filteredRows.length} / ${total.toLocaleString()}`
              : total.toLocaleString()
            } records
          </span>
        </div>

        {/* ── Filter card ── */}
        <div className="pr-filter-card">

          {/* Row 1: Date & Time (via drawer trigger) + WBN */}
          <div className="pr-filter-row">
            <div className="pr-field-group">
              <label className="pr-field-label">WBN Number</label>
              <div className="pr-field-input-wrap">
                <input
                  className="pr-field-input"
                  value={wbnInput}
                  onChange={e => setWbnInput(e.target.value)}
                  placeholder="Enter AWB Number here…"
                />
                {wbnInput && <button className="pr-field-clear" onClick={() => setWbnInput("")}>✕</button>}
              </div>
            </div>

            <div className="pr-field-group">
              <label className="pr-field-label">Status</label>
              <select className="pr-field-input pr-field-select"
                value={sortFilter} onChange={e => setSortFilter(e.target.value)}>
                <option value="">All</option>
                {SORT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
{/* 
            <div className="pr-field-group">
              <label className="pr-field-label">Scanning Mode</label>
              <select className="pr-field-input pr-field-select"
                value={modeFilter} onChange={e => setModeFilter(e.target.value)}>
                <option value="">All</option>
                {MODE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div> */}

            <div className="pr-field-group">
              <label className="pr-field-label">Reason Code</label>
              <select className="pr-field-input pr-field-select"
                value={reasonFilter} onChange={e => setReasonFilter(e.target.value)}>
                <option value="">All</option>
                {REASON_OPTIONS.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
              </select>
            </div>

          </div>

          {/* Action row */}
          <div className="pr-filter-actions">
            <button className="pr-action-btn pr-action-btn--export" onClick={exportData}>
              ⬇ Export CSV
            </button>

                        <button
              className={`pr-action-btn ${
                showDimensions
                  ? "pr-action-btn--dimension"
                  : "pr-action-btn--dimension-active"
              }`}
              onClick={() => setShowDimensions(!showDimensions)}
            >
              {showDimensions ? "📐 Hide Dimensions" : "📐 Show Dimensions"}
            </button>
            
            <button
              className={`pr-action-btn pr-action-btn--date ${drawerOpen ? "pr-action-btn--date-active" : ""}`}
              onClick={() => setDrawerOpen(true)}
              title="Date & Time Filter"
            >
              📅 Date Filter
            </button>
            
            <button className="pr-action-btn pr-action-btn--reset" onClick={handleReset}>
              ↺ Reset
            </button>
            <button className="pr-action-btn pr-action-btn--search"
              onClick={() => {
                if (wbnInput.length >= 2) {
                  setAppliedSearch(wbnInput);
                  setDateRange({ start: null, end: null });
                  setActiveLabel(null);
                  setPage(1);
                  setSearchTrigger(t => t + 1);
                } else if (wbnInput.length === 0) {
                  // Search with only dropdown filters — re-fetch with date/dropdown filters
                  setAppliedSearch("");
                  setPage(1);
                  setSearchTrigger(t => t + 1);
                }
              }}>
              🔍 Search
            </button>
          </div>
        </div>

        {/* ── Active chips ── */}
        {chips.length > 0 && (
          <div className="pr-chips">
            {chips.map(c => <FilterChip key={c.key} label={c.label} value={c.value} onRemove={c.clear} />)}
            <button className="pr-chip-clear-all" onClick={handleReset}>Clear all</button>
          </div>
        )}

        {/* ── Table ── */}
        <DataTable
          value={filteredRows}
          loading={loading}
          paginator
          lazy
          rows={limit}
          totalRecords={total}
          first={(page - 1) * limit}
          rowsPerPageOptions={[100, 500, 1000]}
          onPage={(e) => { setPage(e.page + 1); setLimit(e.rows); }}
          scrollable
          scrollHeight="50vh"
          resizableColumns
          columnResizeMode="expand"
          className="pr-table"
          emptyMessage="No parcels found for the selected filters."
          tableStyle={{ minWidth: "1800px" }}
        >
          <Column
            header="S.No"
            style={{ minWidth: 60, textAlign: "center" }}
            body={(_, opts) => (page - 1) * limit + opts.rowIndex + 1}
          />
          <Column
          field="machine_id"
          header="Machine Id"
          style={{ minWidth: 120 }}
          body={r => r.machine_id
            ? <span className="pr-machine-tag">{String(r.machine_id).toUpperCase()}</span>
            : <span className="bs-cell-muted">—</span>}
        />
        <Column field="infeed"   header="Infeed"       style={{ minWidth: 160 }} />
          <Column field="wbn"      header="WBN"          style={{ minWidth: 160 }} />
          {/* <Column header="Mode"    body={modeBadge}      style={{ minWidth: 80  }} /> */}
          {/* <Column header="Routing"      style={{ minWidth: 100 }} */}
                      {/* body={r => jsonBtn(r.routing, "Routing Data")} /> */}
          {/* <Column header="Status"  body={sortBadge}      style={{ minWidth: 95  }} /> */}
          {/* <Column header="Reason"  body={r => r.reason ? <span className="pr-reason-tag">{r.reason.toUpperCase()}</span> : <span className="pr-cell-muted">—</span>} style={{ minWidth: 80 }} /> */}
          <Column
            header="Expected Bag"
            body={r => r.expected_bag
              ? <span className="pr-bag-tag">{r.expected_bag}</span>
              : <span className="pr-cell-muted">—</span>}
            style={{ minWidth: 120 }}
          />
          <Column
            header="Final Bag"
            body={r => r.final_bag
              ? <span className="pr-bag-tag pr-bag-tag--final">{r.final_bag}</span>
              : <span className="pr-cell-muted">—</span>}
            style={{ minWidth: 100 }}
          />
          {/* <Column header="Wt (g)"  body={r => r.weight    || "—"} style={{ minWidth: 80 }} />
          <Column header="L"       body={r => r.length    || "—"} style={{ minWidth: 55 }} />
          <Column header="W"       body={r => r.width     || "—"} style={{ minWidth: 55 }} />
          <Column header="H"       body={r => r.height    || "—"} style={{ minWidth: 55 }} /> */}
          <Column header="STATUS"       body={r => resultTemplate(r)    || "—"} style={{ minWidth: 55 }} />
          <Column header="REASON"       body={r => r.reason    || "—"} style={{ minWidth: 55 }} />
          {/* <Column header="Volume"  body={r => r.volume    || "—"} style={{ minWidth: 80 }} />
          <Column header="Real Vol" body={r => r.real_volume || "—"} style={{ minWidth: 80 }} /> */}
          {dimensionColumns.map(col => (
          <Column
              key={col.field}
              field={col.field}
              header={col.header}
              body={r => r[col.field] || "—"}
              hidden={!showDimensions}
          />
      ))}
          {/* <Column header="Scan Time"     body={r => fmtIST(r.scantime)}   style={{ minWidth: 155 }} /> */}
          <Column header="Sort Time"     body={r => fmtIST(r.sorttime)}   style={{ minWidth: 155 }} />
          <Column header="Created (IST)" body={r => fmtIST(r.created_at)} style={{ minWidth: 155 }} />
          <Column header="Image"   body={imageBtn}       style={{ minWidth: 65, textAlign: "center" }} />
        </DataTable>

      </div>

      {/* ── Date Filter Drawer ── */}
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        dateRange={dateRange}
        onApplyDate={handleApplyDate}
        onQuickSelect={handleQuickSelect}
        activeLabel={activeLabel}
      />

      {/* ── Image viewer ── */}
      {imgSrc && (
        <div className="pr-img-overlay" onClick={() => setImgSrc(null)}>
          <div className="pr-img-modal" onClick={e => e.stopPropagation()}>
            <div className="pr-img-modal__header">
              <span>Parcel Image</span>
              <button onClick={() => setImgSrc(null)}>✕</button>
            </div>
            <img src={imgSrc} alt="parcel" className="pr-img-modal__img" />
          </div>
        </div>
      )}
            {/* ── JSON Modal ── */}
      {jsonDialog && (
        <div className="bs-json-overlay" onClick={() => setJsonDialog(false)}>
          <div className="bs-json-modal" onClick={e => e.stopPropagation()}>
            <div className="bs-json-modal__header">
              <span>{jsonTitle}</span>
              <button onClick={() => setJsonDialog(false)}>✕</button>
            </div>
            <pre className="bs-json-box">
              {JSON.stringify(jsonData, null, 2)}
            </pre>
          </div>
        </div>
      )}
      
    </div>
  );
};

export default Parcels;
