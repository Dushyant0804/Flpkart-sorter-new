import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Toast } from "primereact/toast";
import "../styles/ProductionReport.css";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimesCircle,
} from "react-icons/fa";
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
    <div className="pd-spb" style={{ width }} tabIndex={0}
      onKeyDown={e => { if (e.key === "ArrowUp") { e.preventDefault(); inc(); } if (e.key === "ArrowDown") { e.preventDefault(); dec(); } }}>
      <button className="pd-spb__arrow" onClick={inc} tabIndex={-1}>▲</button>
      <div className="pd-spb__val" style={{ color, borderColor: color + "80" }}>{p(value)}</div>
      <button className="pd-spb__arrow" onClick={dec} tabIndex={-1}>▼</button>
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
    <div className="pd-dtp">
      <div className="pd-dtp__label" style={{ color }}>
        <span className="pd-dtp__dot" style={{ background: color }} />
        {label}
      </div>
      <div className="pd-dtp__body">
        <div className="pd-dtp__cal">
          <div className="pd-dtp__nav">
            <button className="pd-dtp__navbtn" onClick={prevM}>‹</button>
            <span className="pd-dtp__navtitle">{MONTHS_SHORT[view.month]} {view.year}</span>
            <button className="pd-dtp__navbtn" onClick={nextM}>›</button>
          </div>
          <div className="pd-dtp__dayhdr">
            {DAYS_SHORT.map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="pd-dtp__grid">
            {cells.map((d, i) => (
              <button key={i} disabled={!d}
                className={["pd-dtp__cell",
                  !d ? "pd-dtp__cell--blank" : "",
                  isSel(d) ? "pd-dtp__cell--sel" : "",
                  isToday(d) && !isSel(d) ? "pd-dtp__cell--today" : "",
                ].join(" ")}
                style={isSel(d) ? { background: color, borderColor: color } : {}}
                onClick={() => d && emit({ ...sel, year: view.year, month: view.month, day: d })}
              >{d || ""}</button>
            ))}
          </div>
        </div>
        <div className="pd-dtp__time">
          <div className="pd-dtp__time-title">TIME</div>
          <div className="pd-dtp__time-hint">24h IST</div>
          <div className="pd-dtp__spinrow">
            <SpinBox value={sel.hour} min={0} max={23} onChange={h => emit({ ...sel, hour: h })} color={color} />
            <span className="pd-dtp__colon">:</span>
            <SpinBox value={sel.minute} min={0} max={59} onChange={m => emit({ ...sel, minute: m })} color={color} />
          </div>
          <div className="pd-dtp__timedisp" style={{ color, borderColor: color + "50" }}>
            {String(sel.hour).padStart(2, "0")}:{String(sel.minute).padStart(2, "0")}
          </div>
          <div className="pd-dtp__datedisp">
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
      <div className={`pd-drawer-backdrop ${open ? "pd-drawer-backdrop--open" : ""}`} onClick={onClose} />
      <div className={`pd-filter-drawer ${open ? "pd-filter-drawer--open" : ""}`}>

        <div className="pd-fd-header">
          <div className="pd-fd-header__left">
            <span style={{ fontSize: 20 }}>🔍</span>
            <div>
              <div className="pd-fd-header__title">Date &amp; Time Filter</div>
              <div className="pd-fd-header__sub">All times in IST</div>
            </div>
          </div>
          <button className="pd-fd-close" onClick={onClose}>✕</button>
        </div>

        <div className="pd-fd-tabs">
          <button className={`pd-fd-tab ${tab === "quick" ? "pd-fd-tab--active" : ""}`} onClick={() => setTab("quick")}>⚡ Quick</button>
          <button className={`pd-fd-tab ${tab === "custom" ? "pd-fd-tab--active" : ""}`} onClick={() => setTab("custom")}>🗓 Custom</button>
        </div>

        <div className="pd-fd-body">
          {tab === "quick" && (
            <div>
              <p className="pd-fd-section-label">Select preset range</p>
              <div className="pd-fd-quick-grid">
                {QUICK_RANGES.map(r => {
                  const isActive = activeLabel === r.label;
                  return (
                    <button key={r.label}
                      className={`pd-fd-preset ${isActive ? "pd-fd-preset--active" : ""}`}
                      onClick={() => { onQuickSelect(r.label, r.getRange()); onClose(); }}
                    >
                      <span style={{ fontSize: 15 }}>{r.icon}</span>
                      <span className="pd-fd-preset__label">{r.label}</span>
                      {isActive && <span style={{ color: "#60a5fa", fontSize: 11 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "custom" && (
            <div className="pd-fd-custom">
              <DateTimePicker label="Start" color="#3b82f6" value={start} onChange={setStart} />
              <div style={{ height: 1, background: "#1e2740", margin: "6px 0 10px" }} />
              <DateTimePicker label="End" color="#f97316" value={end} onChange={setEnd} />
              {diffMs > 0
                ? <div className="pd-fd-duration">⏱ Duration: <b>{hrs}h {mins}m</b></div>
                : start && end && <div className="pd-fd-duration pd-fd-duration--warn">⚠️ End must be after Start</div>
              }
              <button className="pd-fd-apply-btn"
                onClick={() => { if (diffMs > 0) { onApplyDate(start, end); onClose(); } }}>
                Apply Range
              </button>
            </div>
          )}
        </div>

        <div className="pd-fd-footer">
          <div className="pd-fd-footer__label">Currently showing</div>
          <div className="pd-fd-footer__range">
            {activeLabel
              ? <span className="pd-fd-footer__badge">{activeLabel}</span>
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
    <span className="pd-chip">
      <span className="pd-chip__label">{label}:</span>
      <span className="pd-chip__val">{value}</span>
      <button className="pd-chip__x" onClick={onRemove}>✕</button>
    </span>
  );
}

// ─── Status & JSON helpers ────────────────────────────────────────────────────

const STATUS_OPTIONS = ["", "true", "false"];
const PRIMARY_OPTIONS = ["true", "false"];

function StatusBadge({ value }) {
  if (value === null || value === undefined) return <span className="pd-cell-muted">—</span>;
  return value
    ? <span className="pd-status pd-status--ok">✔</span>
    : <span className="pd-status pd-status--fail">✖</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

const ProductionReport = () => {
  const toastRef = useRef(null);

  // Selected machine — global state from Navbar's dropdown.
  const { selectedMachine } = useMachine();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);

  // Filters
  const [wbnInput, setWbnInput] = useState("");
  const [itemIdInput, setItemIdInput] = useState("");
  const [appliedItemIdSearch, setAppliedItemIdSearch] = useState("");
  const [chuteCodeInput, setChuteCodeInput] = useState("");
  const [appliedChuteCodeSearch, setAppliedChuteCodeSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [primaryFilter, setPrimaryFilter] = useState("");
  const [imageFilter, setImageFilter] = useState("");
  // const [rejFilter,     setRejFilter    ] = useState("");

  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [activeLabel, setActiveLabel] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchTrigger, setSearchTrigger] = useState(0);

  // JSON viewer
  const [jsonDialog, setJsonDialog] = useState(false);
  const [jsonData, setJsonData] = useState(null);
  const [jsonTitle, setJsonTitle] = useState("");


  const [payloadDialog, setPayloadDialog] = useState(false);
  const [selectedPayload, setSelectedPayload] = useState(null);

  const [reasonFilter, setReasonFilter] = useState("");

  const debounceRef = useRef(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!selectedMachine) return; // wait until the machine list has loaded

    setLoading(true);
    try {
      const p = { page, limit, machine_id: selectedMachine };

      if (appliedSearch) {
        p.search = appliedSearch;
      }

      if (appliedItemIdSearch) {
        p.item_id = appliedItemIdSearch;
      }
      if (appliedChuteCodeSearch) {
        p.chute_id = appliedChuteCodeSearch;
      }
   if (dateRange.start && dateRange.end) {
      p.startTime = dateRange.start.replace("T", " ") + ":00";
      p.endTime = dateRange.end.replace("T", " ") + ":00";
    }

      Object.keys(p).forEach(k => { if (p[k] === "" || p[k] == null) delete p[k]; });

      const res = await axios.get(`${API}/production-report`, { params: p });
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
  }, [page, limit, appliedSearch, dateRange, searchTrigger, selectedMachine]);
  const REASON_OPTIONS = ["CHUTESENSORFULL", "CHUTE_BLOCKED", "LABEL_NO_MATCH", "EMPTY_SORT_CODE", "NO_CHUTE_MATCH", "API_ERROR", "SABP",];
  useEffect(() => { fetchData(); }, [fetchData]);

  // ── WBN debounced search ─────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (wbnInput.length >= 2) {
      debounceRef.current = setTimeout(() => {
        setAppliedSearch(wbnInput);
        setDateRange({ start: null, end: null });
        setActiveLabel(null);
        setPage(1);
      }, 500);
    } else if (wbnInput.length === 0 && appliedSearch) {
      setAppliedSearch("");
      setDateRange({ start: null, end: null });
      setActiveLabel(null);
      setPage(1);
    }
    return () => clearTimeout(debounceRef.current);
  }, [wbnInput]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (itemIdInput.length >= 2) {
      debounceRef.current = setTimeout(() => {
        setAppliedItemIdSearch(itemIdInput);
        setDateRange({ start: null, end: null });
        setActiveLabel(null);
        setPage(1);
      }, 500);
    } else if (itemIdInput.length === 0 && appliedItemIdSearch) {
      setAppliedItemIdSearch("");
      setDateRange({ start: null, end: null });
      setActiveLabel(null);
      setPage(1);
    }

    return () => clearTimeout(debounceRef.current);
  }, [itemIdInput]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (chuteCodeInput.length >= 2) {
      debounceRef.current = setTimeout(() => {
        setAppliedChuteCodeSearch(chuteCodeInput);
        setDateRange({ start: null, end: null });
        setActiveLabel(null);
        setPage(1);
      }, 500);
    } else if (
      chuteCodeInput.length === 0 &&
      appliedChuteCodeSearch
    ) {
      setAppliedChuteCodeSearch("");
      setDateRange({ start: null, end: null });
      setActiveLabel(null);
      setPage(1);
    }

    return () => clearTimeout(debounceRef.current);
  }, [chuteCodeInput]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleApplyDate = (start, end) => {
    setDateRange({ start, end });
    setActiveLabel(null);
    setWbnInput("");
    setAppliedSearch("");
    setPage(1);
  };

  const handleQuickSelect = (label, { start, end }) => {
    setDateRange({ start, end });
    setActiveLabel(label);
    setWbnInput("");
    setAppliedSearch("");
    setPage(1);
  };

    const handleReset = () => {
      setWbnInput("");
      setAppliedSearch("");

      setItemIdInput("");
      setAppliedItemIdSearch("");
      setReasonFilter("");
      setChuteCodeInput("");
      setAppliedChuteCodeSearch("");

      setPrimaryFilter("");
      setImageFilter("");
      // setRejFilter("");

      setDateRange({ start: null, end: null });
      setActiveLabel(null);
      setPage(1);
    };


  const exportData = () => {
    const params = new URLSearchParams();
    if (selectedMachine) {
      params.append("machine_id", selectedMachine);
    }
    if(primaryFilter){
      params.append("status", primaryFilter);
    }
    if(reasonFilter){
    params.append("reason", reasonFilter);
    }
    if (appliedItemIdSearch) {
      params.append("item_id", appliedItemIdSearch);
    }
    if (appliedChuteCodeSearch) {
      params.append("chute_id", appliedChuteCodeSearch);
    }
    if (appliedSearch) {
      params.append("search", appliedSearch);
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
    window.open(`${API}/production-report/export?${params.toString()}`, "_blank");
  };

  const openJson = (data, title) => {
    setJsonData(data);
    setJsonTitle(title);
    setJsonDialog(true);
  };

  // ── Client-side filters ──────────────────────────────────────────────────
  const filteredRows = rows.filter(r => {
    if (primaryFilter !== "" && String(r.status) !== primaryFilter) return false;
    // if (imageFilter   !== "" && String(r.image_status)   !== imageFilter)   return false;
    if (reasonFilter && (r.reason || "").toLowerCase() !== reasonFilter.toLowerCase()) return false;
    // if (rejFilter && !(r.rejection_type || "").toLowerCase().includes(rejFilter.toLowerCase())) return false;
    return true;
  });

  // ── Active chips ─────────────────────────────────────────────────────────
  const badgeText = activeLabel || (dateRange.start ? `${dateRange.start.replace("T", " ")} → ${dateRange.end?.replace("T", " ")}` : null);

  const chips = [
    itemIdInput && {
      key: "itemid",
      label: "Item ID",
      value: `"${itemIdInput}"`,
      clear: () => setItemIdInput("")
    },
    chuteCodeInput && {
      key: "chute",
      label: "Chute",
      value: `"${chuteCodeInput}"`,
      clear: () => setChuteCodeInput("")
    },
    reasonFilter && { key: "reason", label: "Reason", value: reasonFilter.toUpperCase(), clear: () => setReasonFilter("") },
    wbnInput && { key: "wbn", label: "WBN", value: `"${wbnInput}"`, clear: () => setWbnInput("") },
    primaryFilter && { key: "primary", label: "Primary", value: primaryFilter === "SORTED" ? "SORTED" : "REJECTED", clear: () => setPrimaryFilter("") },
    // imageFilter   && { key: "image",   label: "Image",   value: imageFilter   === "true" ? "Pass" : "Fail", clear: () => setImageFilter("") },
    // rejFilter     && { key: "rej",     label: "Reject",  value: rejFilter,        clear: () => setRejFilter("") },
    !wbnInput && badgeText && { key: "date", label: "Range", value: badgeText, clear: handleReset },
  ].filter(Boolean);

  // ── JSON viewer button ───────────────────────────────────────────────────
  const jsonBtn = (data, title) => {
    if (!data) return <span className="pd-cell-muted">—</span>;
    return (
      <button className="pd-json-btn" onClick={() => openJson(data, title)} title={`View ${title}`}>
        👁 View
      </button>
    );
  };
  const payloadTemplate = (data) => (
    <div className="view-btn-wrapper">
      <Button
        label="View"
        icon="pi pi-eye"
        className="view-icon-btn"
        onClick={() => {
          setSelectedPayload(data);
          setPayloadDialog(true);
        }}
      />
    </div>
  );
  const resultTemplate = (row) => {
    const value = row.status?.toLowerCase();

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
      icon: null,
      className: "badge-default",
      label: row.status || "—",
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
  // const InductResponseTemplate = (row) => (
  //   <Button
  //     label="View"
  //     icon="pi pi-eye"
  //     className="p-button-text"
  //     onClick={() => {
  //       setSelectedPayload(row.induct_response);
  //       setPayloadDialog(true);
  //     }}
  //   />
  // );

  return (
    <div className="pd-root">
      <Toast ref={toastRef} />

      <div className="pd-card">

        {/* ── Header ── */}
        <div className="pd-page-header">
          <div className="pd-page-header__left">
            <h2 className="pd-page-title">Production Report</h2>
            {!wbnInput && badgeText && <span className="pd-range-badge">{badgeText}</span>}
            {wbnInput && <span className="pd-range-badge pd-range-badge--search">🔍 "{wbnInput}"</span>}
          </div>
          <span className="pd-total-count">
            {filteredRows.length !== rows.length
              ? `${filteredRows.length} / ${total.toLocaleString()}`
              : total.toLocaleString()
            } records
          </span>
        </div>

        {/* ── Filter Card ── */}
        <div className="pd-filter-card">

          <div className="pd-filter-row">

            {/*SEARCH BY ITEM ID  */}
            <div className="pd-field-group">
              <label className="pd-field-label">Item ID</label>
              <div className="pd-field-input-wrap">
                <input
                  className="pd-field-input"
                  value={itemIdInput}
                  onChange={(e) => setItemIdInput(e.target.value)}
                  placeholder="Search Item ID..."
                />
                {itemIdInput && (
                  <button
                    className="pd-field-clear"
                    onClick={() => setItemIdInput("")}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* search by chute code */}
            <div className="pd-field-group">
              <label className="pd-field-label">Chute Code</label>
              <div className="pd-field-input-wrap">
                <input
                  className="pd-field-input"
                  value={chuteCodeInput}
                  onChange={(e) => setChuteCodeInput(e.target.value)}
                  placeholder="Search Chute Code..."
                />
                {chuteCodeInput && (
                  <button
                    className="pd-field-clear"
                    onClick={() => setChuteCodeInput("")}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            {/* WBN / Tracking / Bag */}
            <div className="pd-field-group">
              <label className="pd-field-label">WBN</label>
              <div className="pd-field-input-wrap">
                <input
                  className="pd-field-input"
                  value={wbnInput}
                  onChange={e => setWbnInput(e.target.value)}
                  placeholder="Search WBN, tracking, bag…"
                />
                {wbnInput && <button className="pd-field-clear" onClick={() => setWbnInput("")}>✕</button>}
              </div>
            </div>

            {/* Primary Status */}
            <div className="pd-field-group">
              <label className="pd-field-label">Primary Status</label>
              <select className="pd-field-input pd-field-select"
                value={primaryFilter} onChange={e => setPrimaryFilter(e.target.value)}>
                <option value="">All</option>
                <option value="SORTED">✔ SORTED</option>
                <option value="REJECTED">✖ REJECTED</option>
              </select>
            </div>

            <div className="pr-field-group">
              <label className="pr-field-label">Reason Code</label>
              <select className="pr-field-input pr-field-select"
                value={reasonFilter} onChange={e => setReasonFilter(e.target.value)}>
                <option value="">All</option>
                {REASON_OPTIONS.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
              </select>
            </div>

          </div>

          {/* Action Row */}
          <div className="pd-filter-actions">
            <button className="pd-action-btn pd-action-btn--export" onClick={exportData}>⬇ Export CSV</button>
            <button
              className={`pd-action-btn pd-action-btn--date ${drawerOpen ? "pd-action-btn--date-active" : ""}`}
              onClick={() => setDrawerOpen(true)}
            >
              📅 Date Filter
            </button>
            <button className="pd-action-btn pd-action-btn--reset" onClick={handleReset}>↺ Reset</button>
            <button className="pd-action-btn pd-action-btn--search"
              onClick={() => {
                setAppliedSearch(wbnInput);
                setAppliedItemIdSearch(itemIdInput);
                setAppliedChuteCodeSearch(chuteCodeInput);

                setDateRange({ start: null, end: null });
                setActiveLabel(null);
                setPage(1);
                setSearchTrigger((t) => t + 1);
              }}>
              🔍 Search
            </button>
          </div>
        </div>

        {/* ── Active Chips ── */}
        {chips.length > 0 && (
          <div className="pd-chips">
            {chips.map(c => <FilterChip key={c.key} label={c.label} value={c.value} onRemove={c.clear} />)}
            <button className="pd-chip-clear-all" onClick={handleReset}>Clear all</button>
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
          className="pd-table"
          emptyMessage="No production records found."
          tableStyle={{ minWidth: "2000px" }}
        >
          <Column
            header="S.No"
            style={{ minWidth: 60 }}
            body={(_, opts) => (page - 1) * limit + opts.rowIndex + 1}
          />
          <Column field="wbn" header="WBN" style={{ minWidth: 155 }}
            body={r => r.wbn || <span className="pd-cell-muted">—</span>} />
          <Column field="item_id" header="item id" style={{ minWidth: 155 }}
            body={r => r.item_id || <span className="pd-cell-muted">—</span>} />
          <Column field="chute_id" header="chute id" style={{ minWidth: 155 }}
            body={r => r.chute_id || <span className="pd-cell-muted">—</span>} />
          <Column field="final_chute_id" header="Final chute id" style={{ minWidth: 155 }}
            body={r => r.final_chute_id || <span className="pd-cell-muted">—</span>} />
          <Column field="status" header="status" style={{ minWidth: 155 }}
            body={r => resultTemplate(r) || <span className="pd-cell-muted">—</span>} />
          <Column field="reason" header="reason" style={{ minWidth: 155 }}
            body={r => r.reason || <span className="pd-cell-muted">—</span>} />
          <Column field="source" header="source" style={{ minWidth: 155 }}
            body={r => r.source || <span className="pd-cell-muted">—</span>} />
          <Column field="inductapi_sent" header="induct api sent" style={{ minWidth: 155 }}
            body={r => (r.inductapi_sent == true) ? <span className="pr-bag-tag--final">true</span> : <span className="pr-reason-tag">false</span>} />
          <Column header="Induct Payload" body={(r) => payloadTemplate(r.induct_payload)} style={{ minWidth: 155 }} />
          <Column header="Induct Response" body={(r) => payloadTemplate(r.induct_response)} style={{ minWidth: 155 }} />
          <Column header="Drop Notification Payload" body={(r) => payloadTemplate(r.drop_notification_payload)} style={{ minWidth: 155 }} />
          <Column header="Drop Notification Response" body={(r) => payloadTemplate(r.drop_notification_response)} style={{ minWidth: 155 }} />
          <Column field="drop_time" header="drop time" style={{ minWidth: 155 }}
            body={r => r.drop_time || <span className="pd-cell-muted">—</span>} />
          <Column field="drop_notification_sent" header="drop notification sent" style={{ minWidth: 155 }}
            body={r => (r.drop_notification_sent == true) ? <span className="pr-bag-tag--final">true</span> : <span className="pr-reason-tag">false</span>} />
          <Column header="Created (IST)" style={{ minWidth: 155 }}
            body={r => fmtIST(r.created_at)} />
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

      {/* ── JSON Dialog ── */}
      {jsonDialog && (
        <div className="pd-json-overlay" onClick={() => setJsonDialog(false)}>
          <div className="pd-json-modal" onClick={e => e.stopPropagation()}>
            <div className="pd-json-modal__header">
              <span>{jsonTitle}</span>
              <button onClick={() => setJsonDialog(false)}>✕</button>
            </div>
            <pre className="pd-json-box">
              {JSON.stringify(jsonData, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Payload Dialog */}
      <Dialog
        header="Payload"
        visible={payloadDialog}
        style={{ width: "60vw" }}
        onHide={() => setPayloadDialog(false)}
      >
        <pre className="sp-payload">
          {JSON.stringify(selectedPayload, null, 2)}
        </pre>
      </Dialog>
    </div>
  );
};

export default ProductionReport;
