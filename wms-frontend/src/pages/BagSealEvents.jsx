import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Toast } from "primereact/toast";
import "../styles/BagSealEvents.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEye,
  faTimes
} from "@fortawesome/free-solid-svg-icons";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Chip,
} from "@mui/material";
import { useMachine } from "../context/MachineContext";
const API = "http://localhost:5001/api";

// ─── IST Helpers ─────────────────────────────────────────────────────────────

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

// ─── Quick Range Presets ──────────────────────────────────────────────────────

const QUICK_RANGES = [
  { label: "Last 24 Hours", icon: "🕐", getRange: () => ({ start: subtractHoursFromNow(24), end: nowIST() }) },
  { label: "Last 48 Hours", icon: "🕑", getRange: () => ({ start: subtractHoursFromNow(48), end: nowIST() }) },
  { label: "Last 72 Hours", icon: "🕒", getRange: () => ({ start: subtractHoursFromNow(72), end: nowIST() }) },
  { label: "Today", icon: "📅", getRange: () => ({ start: todayMidnightIST(), end: todayEndIST() }) },
  { label: "Yesterday", icon: "📆", getRange: () => yesterdayRangeIST() },
  { label: "Last 2 Days", icon: "🗓", getRange: () => ({ start: subtractHoursFromNow(48), end: todayEndIST() }) },
  { label: "Last 3 Days", icon: "📋", getRange: () => ({ start: subtractHoursFromNow(72), end: todayEndIST() }) },
];

// ─── Mini DateTimePicker ──────────────────────────────────────────────────────

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

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
function getFirstDay(y, m) { return new Date(y, m, 1).getDay(); }

function SpinBox({ value, min, max, onChange, color, width = 52 }) {
  const p = (n) => String(n).padStart(2, "0");
  const inc = () => onChange(value >= max ? min : value + 1);
  const dec = () => onChange(value <= min ? max : value - 1);
  return (
    <div className="bs-spb" style={{ width }} tabIndex={0}
      onKeyDown={e => {
        if (e.key === "ArrowUp") { e.preventDefault(); inc(); }
        if (e.key === "ArrowDown") { e.preventDefault(); dec(); }
      }}>
      <button className="bs-spb__arrow" onClick={inc} tabIndex={-1}>▲</button>
      <div className="bs-spb__val" style={{ color, borderColor: color + "80" }}>{p(value)}</div>
      <button className="bs-spb__arrow" onClick={dec} tabIndex={-1}>▼</button>
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
  const [sel, setSel] = useState(init);
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

  const prevM = () => setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  const nextM = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 });

  const days = getDaysInMonth(view.year, view.month);
  const firstDay = getFirstDay(view.year, view.month);
  const cells = Array.from({ length: firstDay + days }, (_, i) => i < firstDay ? null : i - firstDay + 1);
  while (cells.length % 7 !== 0) cells.push(null);

  const istNow = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const isToday = d => d && istNow.getUTCDate() === d && istNow.getUTCMonth() === view.month && istNow.getUTCFullYear() === view.year;
  const isSel = d => d && sel.day === d && sel.month === view.month && sel.year === view.year;

  return (
    <div className="bs-dtp">
      <div className="bs-dtp__label" style={{ color }}>
        <span className="bs-dtp__dot" style={{ background: color }} />
        {label}
      </div>
      <div className="bs-dtp__body">
        <div className="bs-dtp__cal">
          <div className="bs-dtp__nav">
            <button className="bs-dtp__navbtn" onClick={prevM}>‹</button>
            <span className="bs-dtp__navtitle">{MONTHS_SHORT[view.month]} {view.year}</span>
            <button className="bs-dtp__navbtn" onClick={nextM}>›</button>
          </div>
          <div className="bs-dtp__dayhdr">
            {DAYS_SHORT.map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="bs-dtp__grid">
            {cells.map((d, i) => (
              <button key={i} disabled={!d}
                className={["bs-dtp__cell",
                  !d ? "bs-dtp__cell--blank" : "",
                  isSel(d) ? "bs-dtp__cell--sel" : "",
                  isToday(d) && !isSel(d) ? "bs-dtp__cell--today" : "",
                ].join(" ")}
                style={isSel(d) ? { background: color, borderColor: color } : {}}
                onClick={() => d && emit({ ...sel, year: view.year, month: view.month, day: d })}
              >{d || ""}</button>
            ))}
          </div>
        </div>
        <div className="bs-dtp__time">
          <div className="bs-dtp__time-title">TIME</div>
          <div className="bs-dtp__time-hint">24h IST</div>
          <div className="bs-dtp__spinrow">
            <SpinBox value={sel.hour} min={0} max={23} onChange={h => emit({ ...sel, hour: h })} color={color} />
            <span className="bs-dtp__colon">:</span>
            <SpinBox value={sel.minute} min={0} max={59} onChange={m => emit({ ...sel, minute: m })} color={color} />
          </div>
          <div className="bs-dtp__timedisp" style={{ color, borderColor: color + "50" }}>
            {String(sel.hour).padStart(2, "0")}:{String(sel.minute).padStart(2, "0")}
          </div>
          <div className="bs-dtp__datedisp">
            {String(sel.day).padStart(2, "0")} {MONTHS_SHORT[sel.month]} {sel.year}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Filter Drawer ────────────────────────────────────────────────────────────

function FilterDrawer({ open, onClose, dateRange, onApplyDate, onQuickSelect, activeLabel }) {
  const [tab, setTab] = useState("quick");
  const [start, setStart] = useState(dateRange.start || todayMidnightIST());
  const [end, setEnd] = useState(dateRange.end || todayEndIST());

  const prevStart = useRef(dateRange.start);
  const prevEnd = useRef(dateRange.end);
  useEffect(() => {
    if (dateRange.start !== prevStart.current || dateRange.end !== prevEnd.current) {
      prevStart.current = dateRange.start;
      prevEnd.current = dateRange.end;
      if (dateRange.start) setStart(dateRange.start);
      if (dateRange.end) setEnd(dateRange.end);
    }
  }, [dateRange.start, dateRange.end]);

  const diffMs = start && end ? new Date(end + ":00+05:30") - new Date(start + ":00+05:30") : 0;
  const hrs = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);

  return (
    <>
      <div className={`bs-drawer-backdrop ${open ? "bs-drawer-backdrop--open" : ""}`} onClick={onClose} />
      <div className={`bs-filter-drawer ${open ? "bs-filter-drawer--open" : ""}`}>

        <div className="bs-fd-header">
          <div className="bs-fd-header__left">
            <span style={{ fontSize: 20 }}>🔍</span>
            <div>
              <div className="bs-fd-header__title">Date &amp; Time Filter</div>
              <div className="bs-fd-header__sub">All times in IST</div>
            </div>
          </div>
          <button className="bs-fd-close" onClick={onClose}>✕</button>
        </div>

        <div className="bs-fd-tabs">
          <button className={`bs-fd-tab ${tab === "quick" ? "bs-fd-tab--active" : ""}`} onClick={() => setTab("quick")}>⚡ Quick</button>
          <button className={`bs-fd-tab ${tab === "custom" ? "bs-fd-tab--active" : ""}`} onClick={() => setTab("custom")}>🗓 Custom</button>
        </div>

        <div className="bs-fd-body">
          {tab === "quick" && (
            <div>
              <p className="bs-fd-section-label">Select preset range</p>
              <div className="bs-fd-quick-grid">
                {QUICK_RANGES.map(r => {
                  const isActive = activeLabel === r.label;
                  return (
                    <button key={r.label}
                      className={`bs-fd-preset ${isActive ? "bs-fd-preset--active" : ""}`}
                      onClick={() => { onQuickSelect(r.label, r.getRange()); onClose(); }}
                    >
                      <span style={{ fontSize: 15 }}>{r.icon}</span>
                      <span className="bs-fd-preset__label">{r.label}</span>
                      {isActive && <span style={{ color: "#60a5fa", fontSize: 11 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "custom" && (
            <div className="bs-fd-custom">
              <DateTimePicker label="Start" color="#3b82f6" value={start} onChange={setStart} />
              <div style={{ height: 1, background: "#1e2740", margin: "6px 0 10px" }} />
              <DateTimePicker label="End" color="#f97316" value={end} onChange={setEnd} />
              {diffMs > 0
                ? <div className="bs-fd-duration">⏱ Duration: <b>{hrs}h {mins}m</b></div>
                : start && end && <div className="bs-fd-duration bs-fd-duration--warn">⚠️ End must be after Start</div>
              }
              <button className="bs-fd-apply-btn"
                onClick={() => { if (diffMs > 0) { onApplyDate(start, end); onClose(); } }}>
                Apply Range
              </button>
            </div>
          )}
        </div>

        <div className="bs-fd-footer">
          <div className="bs-fd-footer__label">Currently showing</div>
          <div className="bs-fd-footer__range">
            {activeLabel
              ? <span className="bs-fd-footer__badge">{activeLabel}</span>
              : dateRange.start
                ? <span style={{ fontSize: 11 }}>{dateRange.start.replace("T", " ")} → {dateRange.end?.replace("T", " ")} IST</span>
                : <span style={{ fontSize: 11, color: "#475569" }}>All records</span>
            }
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Filter Chip ──────────────────────────────────────────────────────────────

function FilterChip({ label, value, onRemove }) {
  if (!value) return null;
  return (
    <span className="bs-chip">
      <span className="bs-chip__label">{label}:</span>
      <span className="bs-chip__val">{value}</span>
      <button className="bs-chip__x" onClick={onRemove}>✕</button>
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ value }) {
  if (value === null || value === undefined) return <span className="bs-cell-muted">—</span>;
  return value
    ? <span className="bs-status bs-status--ok">✔</span>
    : <span className="bs-status bs-status--fail">✖</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

const BagSealEvents = () => {
  const toastRef = useRef(null);

  // Selected machine — global state from Navbar's dropdown.
  const { selectedMachine } = useMachine();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [wbnDialog, setWbnDialog] = useState(false);
  const [selectedWbns, setSelectedWbns] = useState([]);
  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [successFilter, setSuccessFilter] = useState("");
  const [destFilter, setDestFilter] = useState("");

  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [activeLabel, setActiveLabel] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchTrigger, setSearchTrigger] = useState(0);

  // JSON viewer
  const [jsonDialog, setJsonDialog] = useState(false);
  const [jsonData, setJsonData] = useState(null);
  const [jsonTitle, setJsonTitle] = useState("");

  const [wbnSearch, setWbnSearch] = useState("");
const [appliedWbnSearch, setAppliedWbnSearch] = useState("");

  const debounceRef = useRef(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!selectedMachine) return; // wait until the machine list has loaded

    setLoading(true);
    try {
const p = {
  page,
  limit,
  machine_id: selectedMachine,
};

if (appliedSearch.trim()) {
  p.search = appliedSearch.trim();
}

if (appliedWbnSearch.trim()) {
  p.wbn = appliedWbnSearch.trim();
}

if (dateRange.start && dateRange.end) {
  p.startTime = istLocalToUTC(dateRange.start);
  p.endTime = istLocalToUTC(dateRange.end);
}

      Object.keys(p).forEach(k => { if (p[k] === "" || p[k] == null) delete p[k]; });

      const res = await axios.get(`${API}/bag-closing`, { params: p });
      setRows(res.data.rows || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      toastRef.current?.show({
        severity: "error", summary: "Error",
        detail: err.response?.data?.message || err.message, life: 3000,
      });
    } finally {
      setLoading(false);
    }
  }, [page, limit, appliedSearch, appliedWbnSearch, dateRange, searchTrigger, selectedMachine]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Debounced search (2+ chars) ──────────────────────────────────────────
useEffect(() => {
  if (debounceRef.current) {
    clearTimeout(debounceRef.current);
  }

  debounceRef.current = setTimeout(() => {
    setAppliedSearch(searchInput.trim());
    setAppliedWbnSearch(wbnSearch.trim());
    setPage(1);
  }, 500);

  return () => clearTimeout(debounceRef.current);
}, [searchInput, wbnSearch]);

  // ── Handlers ─────────────────────────────────────────────────────────────
const handleApplyDate = (start, end) => {
  setTimeout(() => {
    setDateRange({ start, end });
    setPage(1);
  }, 0);
};

  const handleQuickSelect = (label, { start, end }) => {
    setDateRange({ start, end });
    setActiveLabel(label);
    setSearchInput("");
    setAppliedSearch("");
    setPage(1);
  };

  const handleReset = () => {
    setSearchInput("");
    setAppliedSearch("");
    setSuccessFilter("");
    setDestFilter("");
    setDateRange({ start: null, end: null });
    setActiveLabel(null);
    setPage(1);
  };
  const openWbnDialog = (wbns) => {
    let list = [];

    if (Array.isArray(wbns)) {
      list = wbns;
    } else if (typeof wbns === "string") {
      list = wbns
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }

    setSelectedWbns(list);
    setWbnDialog(true);
  };
  const exportData = () => {
    const params = new URLSearchParams();
    if (selectedMachine) {
      params.append("machine_id", selectedMachine);
    }
    if (appliedSearch) {
      params.append("search", appliedSearch);
    } 
    if (appliedWbnSearch.trim()) {
    params.append("wbn", appliedWbnSearch.trim());
    }
    if (dateRange.start && dateRange.end) {
      params.append("startTime", istLocalToUTC(dateRange.start));
      params.append("endTime", istLocalToUTC(dateRange.end));
    }
    window.open(`${API}/bag-closing/export?${params.toString()}`, "_blank");
  };

  const openJson = (data, title) => {
    setJsonData(data);
    setJsonTitle(title);
    setJsonDialog(true);
  };

  // ── Client-side filters ──────────────────────────────────────────────────
  const filteredRows = rows.filter(r => {
    if (successFilter !== "" && String(r.success) !== successFilter) return false;
    if (destFilter && !(r.destination || "").toLowerCase().includes(destFilter.toLowerCase())) return false;
    return true;
  });

  // ── Chips ────────────────────────────────────────────────────────────────
  const badgeText = activeLabel || (dateRange.start ? `${dateRange.start.replace("T", " ")} → ${dateRange.end?.replace("T", " ")}` : null);

  const chips = [
    searchInput && { key: "search", label: "Search", value: `"${searchInput}"`, clear: () => setSearchInput("") },
    successFilter && { key: "success", label: "Success", value: successFilter === "true" ? "Pass" : "Fail", clear: () => setSuccessFilter("") },
    destFilter && { key: "dest", label: "Dest", value: destFilter, clear: () => setDestFilter("") },
    !searchInput && badgeText && { key: "date", label: "Range", value: badgeText, clear: handleReset },
  ].filter(Boolean);

  // ── JSON button ──────────────────────────────────────────────────────────
  const jsonBtn = (data, title) => {
    if (!data) return <span className="bs-cell-muted">—</span>;
    return (
      <button className="view-icon-btn" onClick={() => openJson(data, title)} title={`View ${title}`}>
        👁 View
      </button>
    );
  };

  return (
    <div className="bs-root">
      <Toast ref={toastRef} />

      <div className="bs-card">

        {/* ── Header ── */}
        <div className="bs-page-header">
          <div className="bs-page-header__left">
            <h2 className="bs-page-title">Bag Seal Events</h2>
            {!searchInput && badgeText && <span className="bs-range-badge">{badgeText}</span>}
            {searchInput && <span className="bs-range-badge bs-range-badge--search">🔍 "{searchInput}"</span>}
          </div>
          <span className="bs-total-count">
            {filteredRows.length !== rows.length
              ? `${filteredRows.length} / ${total.toLocaleString()}`
              : total.toLocaleString()
            } records
          </span>
        </div>

        {/* ── Filter Card ── */}
        <div className="bs-filter-card">
          <div className="bs-filter-card__title">Search Bag Seal Events</div>

          <div className="bs-filter-row">

            {/* Search */}
            <div className="bs-field-group">
              <label className="bs-field-label">Chute ID</label>
              <div className="bs-field-input-wrap">
                <input
                  className="bs-field-input"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Search bag, seal, operator…"
                />
                {searchInput && <button className="bs-field-clear" onClick={() => setSearchInput("")}>✕</button>}
              </div>
            </div>

            <div className="bs-field-group">
            <label className="bs-field-label">WBN Search</label>

            <div className="bs-field-input-wrap">
              <input
                className="bs-field-input"
                value={wbnSearch}
                onChange={(e) => setWbnSearch(e.target.value)}
                placeholder="Enter WBN..."
              />
            </div>
          </div>

          </div>

          {/* Action Row */}
          <div className="bs-filter-actions">
            <button className="bs-action-btn bs-action-btn--export" onClick={exportData}>⬇ Export CSV</button>
            <button
              className={`bs-action-btn bs-action-btn--date ${drawerOpen ? "bs-action-btn--date-active" : ""}`}
              onClick={() => setDrawerOpen(true)}
            >
              📅 Date Filter
            </button>
            <button className="bs-action-btn bs-action-btn--reset" onClick={handleReset}>↺ Reset</button>
            <button className="bs-action-btn bs-action-btn--search"
              onClick={() => {
               setAppliedSearch(searchInput);
                setAppliedWbnSearch(wbnSearch);
                setPage(1);
                setSearchTrigger((t) => t + 1);
              }}>
              🔍 Search
            </button>
          </div>
        </div>

        {/* ── Active Chips ── */}
        {chips.length > 0 && (
          <div className="bs-chips">
            {chips.map(c => <FilterChip key={c.key} label={c.label} value={c.value} onRemove={c.clear} />)}
            <button className="bs-chip-clear-all" onClick={handleReset}>Clear all</button>
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
          className="bs-table"
          emptyMessage="No bag seal events found."
          tableStyle={{ minWidth: "1400px" }}
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
          <Column
            field="chute_id"
            header="Chute Id"
            style={{ minWidth: 100 }}
            body={r => r.chute_id
              ? <span className="pr-bag-tag">{r.chute_id}</span>
              : <span className="bs-cell-muted">—</span>}
          />
          <Column
            header="WBNS"
            style={{ minWidth: "180px" }}
            body={(row) => {

              let count = 0;

              if (Array.isArray(row.wbns))
                count = row.wbns.length;
              else if (typeof row.wbns === "string")
                count = row.wbns.split(",").filter(Boolean).length;

              return (
                <button
                  onClick={() => openWbnDialog(row.wbns)}
                  className="view-icon-btn"
                >
                  <FontAwesomeIcon icon={faEye} />
                  <span style={{ marginLeft: "8px" }}>
                    View
                  </span>
                </button>
              );
            }}
          />
          <Column
            header="Total Shipments"
            style={{ minWidth: "120px", textAlign: "center" }}
            body={(row) => {
              if (Array.isArray(row.wbns)) {
                return row.wbns.length;
              }

              if (typeof row.wbns === "string") {
                return row.wbns
                  .split(",")
                  .filter((item) => item.trim() !== "").length;
              }

              return 0;
            }}
          />
          <Column field="bag_closed_at" header="Bag Close At" style={{ minWidth: 110 }}
            body={r => r.bag_closed_at || <span className="bs-cell-muted">—</span>} />
          <Column header="Bag Close Payload" style={{ minWidth: 100 }}
            body={r => jsonBtn(r.bag_close_payload, "Request Payload")} />
          <Column header="Bag Close Response" style={{ minWidth: 100 }}
            body={r => jsonBtn(r.bag_close_response, "Response")} />
        </DataTable>

      </div>

      {/* ── Filter Drawer ── */}
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        dateRange={dateRange}
        onApplyDate={handleApplyDate}
        onQuickSelect={handleQuickSelect}
        activeLabel={activeLabel}
      />

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

      <Dialog
        open={wbnDialog}
        onClose={() => setWbnDialog(false)}
        maxWidth="sm"
        fullWidth
      >

        <DialogTitle
          sx={{
            bgcolor: "#ff7a00",
            color: "#fff",
            fontWeight: 700,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          WBN List

          <IconButton
            onClick={() => setWbnDialog(false)}
            sx={{
              color: "#fff"
            }}
          >
            <FontAwesomeIcon icon={faTimes} />
          </IconButton>

        </DialogTitle>

        <DialogContent
          sx={{
            background: "#fff",
            paddingTop: "20px"
          }}
        >

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }}
          >

            {selectedWbns.map((wbn, index) => (

              <div
                key={index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  border: "1px solid #eee",
                  borderRadius: "10px",
                  padding: "12px 18px",
                  background: "#fff7ef",
                  padding: "15px",
                  width:"100%"
                }}
              >

                <Chip
                  label={index + 1}
                  sx={{
                    background: "linear-gradient(135deg, #ebc29c, #f0af54)",
                    color: "#fff",
                    fontWeight: "bold",
                  }}
                />

                <span
                  style={{
                    fontWeight: 600,
                    color: "#444",
                    fontSize: "15px",
                    letterSpacing: ".5px",
                    margin:"10px"
                  }}
                >
                  {wbn}
                </span>

              </div>

            ))}

          </div>

        </DialogContent>

      </Dialog>
    </div>
  );
};

export default BagSealEvents;