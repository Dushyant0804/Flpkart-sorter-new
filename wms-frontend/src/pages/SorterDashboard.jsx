import { useState, useEffect, useRef } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer, ComposedChart, Cell, BarChart, Bar
} from "recharts";
import * as XLSX from "xlsx";
import "../styles/SorterDashboard.css";
import Card from "react-bootstrap/Card";
import AWBSearchModal from "../pages/AWBSearchModal.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBoxArchive } from "@fortawesome/free-solid-svg-icons";
import {
  BsBoxSeam,
  BsCheckCircleFill,
  BsExclamationTriangleFill,
  BsBarChartFill,
  BsArrowRepeat
} from "react-icons/bs";
import { TfiDownload } from "react-icons/tfi";
import axios from "axios";
import { useMachine } from "../context/MachineContext";

// ─── IST Helpers ──────────────────────────────────────────────────────────────

function toIST(utcStr) {
  const d = new Date(utcStr);
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
}

function nowIST() {
  const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}T${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}

function istLocalToUTC(istLocalStr) {
  return new Date(istLocalStr + ":00+05:30").toISOString();
}

function todayMidnightIST() {
  const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}T00:00`;
}

function todayEndIST() {
  const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}T23:59`;
}

function subtractHoursFromNow(hours) {
  const shifted = new Date(new Date().getTime() - hours * 60 * 60 * 1000);
  const ist = new Date(shifted.getTime() + 5.5 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}T${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}

function yesterdayRangeIST() {
  const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const y = new Date(ist.getTime() - 24 * 60 * 60 * 1000);
  const date = `${y.getUTCFullYear()}-${pad(y.getUTCMonth() + 1)}-${pad(y.getUTCDate())}`;
  return { start: `${date}T00:00`, end: `${date}T23:59` };
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

// ─── Rejection labels ─────────────────────────────────────────────────────────

const REJECTION_LABELS = {
  dbo: "DBO", nle: "NLE", dnf: "DNF", ibo: "IBO",
  hv: "High Value", ndim: "NDIM", unx: "UNX", mse: "MSE", nsz: "NSZ",
};
const IGNORE_REASON_CODES = new Set(["ul", "null", "none", ""]);

function getRejectionLabel(code) {
  if (!code) return null;
  const lower = code.toLowerCase();
  if (IGNORE_REASON_CODES.has(lower)) return null;
  return REJECTION_LABELS[lower] || code.toUpperCase();
}

// ─── Export to Excel ──────────────────────────────────────────────────────────

function exportToExcel(data, filename, sheetName = "Data") {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const CustomBarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <div className="custom-tooltip__label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: <b>{p.value}</b></div>
      ))}
    </div>
  );
};

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ on, onToggle }) {
  return (
    <div className="toggle-wrap">
      <span className="toggle-label">Count</span>
      <div
        className={`toggle ${on ? "toggle--on" : ""}`}
        onClick={onToggle}
        role="switch"
        aria-checked={on}
      >
        <div className="toggle__thumb" />
      </div>
    </div>
  );
}

// ─── DateTimePicker helpers ───────────────────────────────────────────────────

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

// ─── SpinBox ──────────────────────────────────────────────────────────────────

function SpinBox({ value, min, max, onChange, color, width = 52 }) {
  const p = (n) => String(n).padStart(2, "0");
  const inc = () => onChange(value >= max ? min : value + 1);
  const dec = () => onChange(value <= min ? max : value - 1);
  const handleKey = (e) => {
    if (e.key === "ArrowUp") { e.preventDefault(); inc(); }
    if (e.key === "ArrowDown") { e.preventDefault(); dec(); }
  };
  return (
    <div className="spb" style={{ width }} onKeyDown={handleKey} tabIndex={0}>
      <button className="spb__arrow" onClick={inc} tabIndex={-1}>▲</button>
      <div className="spb__val" style={{ color, borderColor: color + "80" }}>{p(value)}</div>
      <button className="spb__arrow" onClick={dec} tabIndex={-1}>▼</button>
    </div>
  );
}

// ─── DateTimePicker ───────────────────────────────────────────────────────────

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
    <div className="dtp">
      <div className="dtp__label" style={{ color }}>
        <span className="dtp__dot" style={{ background: color }} />
        {label}
      </div>
      <div className="dtp__body">
        <div className="dtp__cal">
          <div className="dtp__nav">
            <button className="dtp__navbtn" onClick={prevM}>‹</button>
            <span className="dtp__navtitle">{MONTHS_SHORT[view.month]} {view.year}</span>
            <button className="dtp__navbtn" onClick={nextM}>›</button>
          </div>
          <div className="dtp__dayhdr">
            {DAYS_SHORT.map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="dtp__grid">
            {cells.map((d, i) => (
              <button
                key={i}
                disabled={!d}
                className={["dtp__cell",
                  !d ? "dtp__cell--blank" : "",
                  isSel(d) ? "dtp__cell--sel" : "",
                  isToday(d) && !isSel(d) ? "dtp__cell--today" : "",
                ].join(" ")}
                style={isSel(d) ? { background: color, borderColor: color } : {}}
                onClick={() => d && emit({ ...sel, year: view.year, month: view.month, day: d })}
              >
                {d || ""}
              </button>
            ))}
          </div>
        </div>
        <div className="dtp__time">
          <div className="dtp__time-title">TIME</div>
          <div className="dtp__time-hint">24-hour (IST)</div>
          <div className="dtp__spinrow">
            <SpinBox value={sel.hour} min={0} max={23} onChange={h => emit({ ...sel, hour: h })} color={color} />
            <span className="dtp__colon">:</span>
            <SpinBox value={sel.minute} min={0} max={59} onChange={m => emit({ ...sel, minute: m })} color={color} />
          </div>
          <div className="dtp__timedisp" style={{ color, borderColor: color + "50" }}>
            {String(sel.hour).padStart(2, "0")}:{String(sel.minute).padStart(2, "0")}
          </div>
          <div className="dtp__datedisp">
            {String(sel.day).padStart(2, "0")} {MONTHS_SHORT[sel.month]} {sel.year}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FilterDrawer ─────────────────────────────────────────────────────────────

function FilterDrawer({ open, onClose, onApply, current, activeLabel, onQuickSelect }) {
  const [start, setStart] = useState(current.start || todayMidnightIST());
  const [end, setEnd] = useState(current.end || todayEndIST());
  const [tab, setTab] = useState("quick");

  const prevStart = useRef(current.start);
  const prevEnd = useRef(current.end);

  useEffect(() => {
    if (current.start !== prevStart.current || current.end !== prevEnd.current) {
      prevStart.current = current.start;
      prevEnd.current = current.end;
      if (current.start) setStart(current.start);
      if (current.end) setEnd(current.end);
    }
  }, [current.start, current.end]);

  return (
    <>
      <div
        className={`drawer-backdrop ${open ? "drawer-backdrop--open" : ""}`}
        onClick={onClose}
      />
      <div className={`filter-drawer ${open ? "filter-drawer--open" : ""}`}>

        <div className="fd-header">
          <div className="fd-header__left">
            <span className="fd-header__icon">🔍</span>
            <div>
              <div className="fd-header__title">Filter Data</div>
              <div className="fd-header__sub">Select a date &amp; time range (IST)</div>
            </div>
          </div>
          <button className="fd-close" onClick={onClose}>✕</button>
        </div>

        <div className="fd-tabs">
          <button
            className={`fd-tab ${tab === "quick" ? "fd-tab--active" : ""}`}
            onClick={() => setTab("quick")}
          >
            ⚡ Quick Select
          </button>
          <button
            className={`fd-tab ${tab === "custom" ? "fd-tab--active" : ""}`}
            onClick={() => setTab("custom")}
          >
            🗓 Custom Range
          </button>
        </div>

        <div className="fd-body">

          {tab === "quick" && (
            <div className="fd-quick">
              <p className="fd-section-label">Select a preset range</p>
              <div className="fd-quick-grid">
                {QUICK_RANGES.map((r) => {
                  const range = r.getRange();
                  const isActive = activeLabel === r.label;
                  return (
                    <button
                      key={r.label}
                      className={`fd-preset ${isActive ? "fd-preset--active" : ""}`}
                      onClick={() => { onQuickSelect(r.label, range); onClose(); }}
                    >
                      <span className="fd-preset__icon">{r.icon}</span>
                      <span className="fd-preset__label">{r.label}</span>
                      {isActive && <span className="fd-preset__check">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "custom" && (
            <div className="fd-custom">
              <DateTimePicker label="Start Date & Time" color="#3b82f6" value={start} onChange={setStart} />
              <div className="fd-divider" />
              <DateTimePicker label="End Date & Time" color="#f97316" value={end} onChange={setEnd} />

              {start && end && (() => {
                const diffMs = new Date(end + ":00+05:30") - new Date(start + ":00+05:30");
                if (diffMs <= 0) return (
                  <div className="fd-duration fd-duration--warn">⚠️ End must be after Start</div>
                );
                const hrs = Math.floor(diffMs / 3600000);
                const mins = Math.floor((diffMs % 3600000) / 60000);
                return <div className="fd-duration">⏱ Duration: <b>{hrs}h {mins}m</b></div>;
              })()}

              <button
                className="fd-apply-btn"
                onClick={() => {
                  const diffMs = new Date(end + ":00+05:30") - new Date(start + ":00+05:30");
                  if (diffMs > 0) { onApply(start, end); onClose(); }
                }}
              >
                Apply Custom Range
              </button>
            </div>
          )}
        </div>

        <div className="fd-footer">
          <div className="fd-footer__label">Currently showing</div>
          <div className="fd-footer__range">
            {activeLabel
              ? <span className="fd-footer__badge">{activeLabel}</span>
              : <>
                <span>{current.start?.replace("T", " ") || "—"}</span>
                <span className="fd-footer__arrow">→</span>
                <span>{current.end?.replace("T", " ") || "—"}</span>
              </>
            }
          </div>
        </div>

      </div>
    </>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent, icon }) {
  return (
    <div
      className="stat-card"
      style={{
        background: `linear-gradient(135deg, ${accent}18, ${accent}08)`,
        border: `1px solid ${accent}40`,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 8px 30px ${accent}30`; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <div className="stat-card__blob" style={{ background: `${accent}15` }} />
      <div className="stat-card__icon">{icon}</div>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">
        {value ?? <span className="stat-card__empty">—</span>}
      </div>
    </div>
  );
}

// ─── ChartCard ────────────────────────────────────────────────────────────────

function ChartCard({ title, children, toggle, onToggle, onDownload }) {
  return (
    <div className="chart-card">
      <div className="chart-card__header">
        <h2 className="chart-card__title">{title}</h2>
        <div className="chart-card__controls">
          <span className="toggle-label">Download</span>
          <button className="chart-dl-btn" title="Download Excel" onClick={onDownload}>
            <TfiDownload />
          </button>
          <Toggle on={toggle} onToggle={onToggle} className="toggle-switch" />
        </div>
      </div>
      {children}
    </div>
  );
}

const BarLabel = (props) => {
  const { x, y, width, value } = props;
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 4} fill="#fff" fontSize={10} fontWeight={600} textAnchor="middle">
      {value}
    </text>
  );
};

const TICK = { fill: "#cbd5e1", fontSize: 11 };
const TICK_SM = { fill: "#cbd5e1", fontSize: 10 };

// ─── BagParcelChart — defined OUTSIDE dashboard to prevent DOM destroy on re-render

function BagParcelChart({ data, loading, onDownload }) {
  const colors = ["#ff6b00", "#ff7a1a", "#ff8c33", "#ff9d4d", "#ffae66"];

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bag-custom-tooltip">
        <h4>{payload[0].payload.bag}</h4>
        <p>{payload[0].value} Parcels</p>
      </div>
    );
  };

  if (loading) return <div className="bag-chart-loader">Loading Chart...</div>;

  return (
    <div className="bag-chart-main-container">
      <div className="bag-chart-header">
        <div>
          <h2>Bag Parcel Analytics</h2>
          <p>Realtime parcel count inside bags</p>
        </div>
        <div className="ms-auto bag-total-bags">
          <button
            style={{ border: "none", background: "none", color: "white" }}
            onClick={onDownload}
          >
            Download
          </button>
        </div>
        <div className="bag-total-bags">
          <span>{data.length} Bags</span>
        </div>
      </div>

      <div className="bag-chart-scroll-container">
        <div className="bag-chart-wrapper">
          <ResponsiveContainer width="100%" height={450}>
            <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
              <XAxis dataKey="bag" tick={{ fill: "#666", fontSize: 12 }} />
              <YAxis tick={{ fill: "#666", fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="parcels" radius={[10, 10, 0, 0]}>
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── ParcelHourlyChart — defined OUTSIDE dashboard ────────────────────────────

function ParcelHourlyChart({ data }) {
  return (
    <div
      style={{
        background: "#fff",
        padding: "24px",
        borderRadius: "16px",
        boxShadow: "0 4px 20px rgba(255,140,0,0.08)",
      }}
    >
      <h3 style={{ marginBottom: "20px", color: "#ff7a00", fontWeight: 700 }}>
        Hourly Parcel Scans
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={data} margin={{ top: 20, right: 20, left: 10, bottom: 70 }}>
          <defs>
            <linearGradient id="orangeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff7a00" />
              <stop offset="100%" stopColor="#ffb366" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffe4cc" />
          <XAxis
            dataKey="time"
            angle={-45}
            textAnchor="end"
            interval={0}
            tick={{ fill: "#ff7a00", fontSize: 11 }}
          />
          <YAxis
            allowDecimals={false}
            tickCount={6}
            domain={[0, "dataMax"]}
            tick={{ fill: "#ff7a00" }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid #ffd2a3",
              backgroundColor: "#fff",
              color: "#0e44f5",
              fontWeight: "600",
            }}
          />
          <Bar dataKey="scans" fill="url(#orangeGradient)" radius={[8, 8, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function SorterDashboard() {

  // Selected machine — global state from Navbar's dropdown. Every fetch
  // below is scoped to this machine and re-runs when it changes.
  const { selectedMachine } = useMachine();

  // ── Filter state — primitives only, no object in deps ─────────────────────
  const [filterStart, setFilterStart] = useState(todayMidnightIST());
  const [filterEnd, setFilterEnd] = useState(todayEndIST());
  const [activeLabel, setActiveLabel] = useState("Today");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Summary data (replaces raw row fetching) ───────────────────────────────
  const [summary, setSummary] = useState(null);   // { scanned, sorted, rejected, rejectionBreakdown }
  const [closedBagCount, setClosedBagCount] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);

  // ── Static charts (no date filter — always today / current state) ──────────
  const [bagChartData, setBagChartData] = useState([]);
  const [bagChartLoading, setBagChartLoading] = useState(true);
  const [hourlyChartData, setHourlyChartData] = useState([]);
  const [hourlyLoading, setHourlyLoading] = useState(true);

  // ── Chart toggles ──────────────────────────────────────────────────────────
  const [feedToggle, setFeedToggle] = useState(false);
  const [rejToggle, setRejToggle] = useState(false);

  const [awbSearchOpen, setAwbSearchOpen] = useState(false);

  // ── Effect 1: Filter-dependent data ───────────────────────────────────────
  // Fires when filterStart, filterEnd, OR selectedMachine changes.
  // Uses AbortController to cancel in-flight requests on fast filter/machine switching.
  // Fetches dashboard summary + closed bag count in parallel — no raw row pagination.

  useEffect(() => {
    if (!selectedMachine) return; // wait until the machine list has loaded

    const controller = new AbortController();

    const loadSummary = async () => {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const startUTC = istLocalToUTC(filterStart);
        const endUTC = istLocalToUTC(filterEnd);

        const [summaryRes, closedBagRes] = await Promise.all([
          // New aggregated endpoint — returns counts, not raw rows
          axios.get("http://localhost:5001/api/dashboard-summary", {
            params: {
              startTime: filterStart.replace("T", " ") + ":00",
              endTime: filterEnd.replace("T", " ") + ":00",
              machine_id: selectedMachine,
            },
            signal: controller.signal,
          }),
          axios.get("http://localhost:5001/api/bags/countALLClosedBag", {
            params: {
              start: startUTC,
              end: endUTC, // UTC — server does timestamptz comparison
              machine_id: selectedMachine,
            },
            signal: controller.signal,
          }),
        ]);

        setSummary(summaryRes.data);
        setClosedBagCount(closedBagRes.data[0]?.total ?? null);

      } catch (err) {
        if (axios.isCancel(err) || err.name === "CanceledError") return;
        setSummaryError(err.response?.data?.message || err.message);
      } finally {
        setSummaryLoading(false);
      }
    };

    loadSummary();
    return () => controller.abort();

  }, [filterStart, filterEnd, selectedMachine]); // primitives — no stale closure, no infinite loop

  // ── Effect 2: Static charts — re-run when the selected machine changes ────
  // These charts show today's state for the CURRENTLY SELECTED machine,
  // regardless of the date filter.

  useEffect(() => {
    if (!selectedMachine) return; // wait until the machine list has loaded

    const controller = new AbortController();

    const loadStaticCharts = async () => {
      setBagChartLoading(true);
      setHourlyLoading(true);
      try {
        const [bagRes, hourlyRes] = await Promise.all([
          axios.get("http://localhost:5001/api/bags/getBagParcelChart", {
            params: { machine_id: selectedMachine },
            signal: controller.signal,
          }),
          axios.get("http://localhost:5001/api/hourly-scan-report", {
            params: { machine_id: selectedMachine },
            signal: controller.signal,
          }),
        ]);

        setBagChartData(bagRes.data || []);
        setBagChartLoading(false);

        if (hourlyRes.data.success) {
          setHourlyChartData(hourlyRes.data.data || []);
        }
        setHourlyLoading(false);

      } catch (err) {
        if (axios.isCancel(err) || err.name === "CanceledError") return;
        console.error("Static chart load failed:", err.message);
        setBagChartLoading(false);
        setHourlyLoading(false);
      }
    };

    loadStaticCharts();
    return () => controller.abort();

  }, [selectedMachine]); // re-fetch when the machine changes

  // ── Derived stats from summary ─────────────────────────────────────────────

  const scanned = summary?.scanned ?? 0;
  const sorted = summary?.sorted ?? 0;
  const rejected = summary?.rejected ?? 0;
  const rejectedPct = scanned > 0 ? ((rejected / scanned) * 100).toFixed(2) : "0.00";

  // Rejection breakdown — from summary API, not client-side row counting
  const rejData = (summary?.rejectionBreakdown || []).map(r => ({
    name: getRejectionLabel(r.reason) || r.reason,
    count: r.count,
  }));
  const rejTotal = rejData.reduce((s, d) => s + d.count, 0);
  const rejDataWithPct = rejData.map(d => ({
    ...d,
    pct: rejTotal > 0 ? +((d.count / rejTotal) * 100).toFixed(2) : 0,
  }));

// Recirculation — from sort = 'RECIRCULATE' in primary_bin_data
const chuteFullRejection = summary?.recirculateCount ?? 0;

// All rejections excluding recirculate for the rejection chart
const otherRejections = rejDataWithPct;

  // Total count of all other rejections
  const otherRejectionTotal = rejected;
  const otherRejectionPct =
  scanned > 0
    ? +((otherRejectionTotal / scanned) * 100).toFixed(2)
    : 0;
  // Feedlane data — hardcoded until primary_bin_data has an infeed column
  const infeed1 = summary?.infeed1Count ?? 0;
  const infeed2 = summary?.infeed2Count ?? 0;
  const infeedTotal = infeed1 + infeed2;
  const feedData = [
    {
      name: "INFEED-01",
      count: infeed1,
      pct: infeedTotal > 0 ? +((infeed1 / infeedTotal) * 100).toFixed(1) : 0,
    },
    {
      name: "INFEED-02",
      count: infeed2,
      pct: infeedTotal > 0 ? +((infeed2 / infeedTotal) * 100).toFixed(1) : 0,
    },
  ];

  // ── Filter handlers ────────────────────────────────────────────────────────

  const handleReset = () => {
    setFilterStart(todayMidnightIST());
    setFilterEnd(todayEndIST());
    setActiveLabel("Today");
  };

  const handleApply = (start, end) => {
    setFilterStart(start);
    setFilterEnd(end);
    setActiveLabel(null);
  };

  const handleQuickSelect = (label, { start, end }) => {
    setFilterStart(start);
    setFilterEnd(end);
    setActiveLabel(label);
  };

  // current filter object — for FilterDrawer display only, not used as state dep
  const currentFilter = { start: filterStart, end: filterEnd };

  const badgeText = activeLabel
    || (filterStart ? `${filterStart.replace("T", " ")} → ${filterEnd?.replace("T", " ")}` : null);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="dashboard">

      {/* ── Header ── */}
      <div className="dashboard__header">
        <div className="dashboard__header-left">
          <h1 className="dashboard__title">Sorter Dashboard</h1>
        </div>
        <div className="dashboard__actions">
          {badgeText && <span className="filter-badge">{badgeText}</span>}

          <button
            className={`dash-btn dash-btn--date ${drawerOpen ? "dash-btn--active" : ""}`}
            onClick={() => setDrawerOpen(true)}
          >
            <span className="dash-btn__icon">📅</span>
            <span className="dash-btn__label">Date Filter</span>
          </button>

          <button className="dash-btn dash-btn--awb" onClick={() => setAwbSearchOpen(true)}>
            <span className="dash-btn__icon">🔎</span>
            <span className="dash-btn__label">AWB Search</span>
          </button>

          <button className="dash-btn dash-btn--reset" onClick={handleReset}>
            <span className="dash-btn__icon">↺</span>
            <span className="dash-btn__label">Reset</span>
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {summaryError && (
        <div className="error-banner">⚠️ {summaryError} — Check API</div>
      )}

      {/* ── Loading ── */}
      {(summaryLoading || !selectedMachine) && (
        <div className="loading-state">
          <div className="loading-state__icon">⟳</div>
          <div>Loading dashboard data…</div>
        </div>
      )}

      {!summaryLoading && selectedMachine && (
        <>
          {/* ── Stat Cards ── */}
          <div
            className="d-grid gap-3 mb-4"
            style={{ gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))" }}
          >
            <Card style={{ background: "#6868f4", color: "#fff", border: "none", borderRadius: "16px" }}>
              <Card.Body>
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <h3>{scanned.toLocaleString()}</h3>
                    <p className="mb-0">Shipments Scanned</p>
                  </div>
                  <BsBoxSeam size={34} />
                </div>
              </Card.Body>
            </Card>

            <Card style={{ background: "#27ae60", color: "#fff", border: "none", borderRadius: "16px" }}>
              <Card.Body>
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <h3>{sorted.toLocaleString()}</h3>
                    <p className="mb-0">Shipments Sorted</p>
                  </div>
                  <BsCheckCircleFill size={34} />
                </div>
              </Card.Body>
            </Card>

            <Card style={{ background: "#e67e22", color: "#fff", border: "none", borderRadius: "16px", height: "150px" }}>
              <Card.Body>
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <h3>{otherRejectionTotal.toLocaleString()}</h3>
                    <p className="mb-0">Shipments Rejected</p>
                  </div>
                  <BsExclamationTriangleFill size={34} />
                </div>
              </Card.Body>
            </Card>

            <Card
              style={{
                background: "#3498db",
                color: "#fff",
                border: "none",
                borderRadius: "16px",
              }}
            >
              <Card.Body>
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <h3>{chuteFullRejection.toLocaleString()}</h3>
                    <p className="mb-0">Re-Circulation</p>
                  </div>
                  <BsArrowRepeat size={30} />
                </div>
              </Card.Body>
            </Card>

            <Card style={{ background: "#e74c3c", color: "#fff", border: "none", borderRadius: "16px" }}>
              <Card.Body>
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <h3>{otherRejectionPct}%</h3>
                    <p className="mb-0">Rejection %</p>
                  </div>
                  <BsBarChartFill size={34} />
                </div>
              </Card.Body>
            </Card>

            <Card style={{ background: "#e40de1", color: "#fff", border: "none", borderRadius: "16px" }}>
              <Card.Body>
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <h3>{closedBagCount ?? "—"}</h3>
                    <p className="mb-0">Closed Bags</p>
                  </div>
                  <FontAwesomeIcon icon={faBoxArchive} size="2x" />
                </div>
              </Card.Body>
            </Card>
          </div>

          {/* ── Top Charts ── */}
          <div className="charts-row">
            <ChartCard
              title="Feedlane Wise Utilization"
              toggle={feedToggle}
              onToggle={() => setFeedToggle(p => !p)}
              onDownload={() => exportToExcel(feedData, "feedlane_utilization", "Feedlane")}
            >
              <div className="chart-radio-row">
                <label className="chart-radio-pill"><span className="chart-radio-dot" />Cumulative</label>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={feedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip
                    cursor={{ fill: "transparent" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div style={{
                          background: "#645555", padding: "10px 12px", borderRadius: "8px",
                          border: "1px solid #374151", color: "#fff", boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
                        }}>
                          <p style={{ margin: 0, color: "#93c5fd" }}>{d.name}</p>
                          <p style={{ margin: 0, color: "#fbbf24" }}>Scanned: {d.count}</p>
                          <p style={{ margin: 0, color: "#34d399" }}>Utilization: {d.pct}%</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" fill="#f7560b" barSize={15} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                <span>🟠 Utilization %</span>
                <span className="chart-legend__item--blue">🔵 Utilization Count</span>
              </div>
            </ChartCard>

            <ChartCard
              title="Rejected Shipments Details"
              toggle={rejToggle}
              onToggle={() => setRejToggle(p => !p)}
              onDownload={() => exportToExcel(rejDataWithPct, "rejection_details", "Rejections")}
            >
              <div className="chart-radio-row">
                <label className="chart-radio-pill"><span className="chart-radio-dot" />Cumulative</label>
              </div>
              <ResponsiveContainer width="100%" height={230}>
                <ComposedChart data={rejDataWithPct} margin={{ top: 10, right: 28, left: 0, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2740" />
                  <XAxis dataKey="name" tick={TICK_SM} angle={-25} textAnchor="end" interval={0} />
                  <YAxis yAxisId="left" tick={TICK} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={TICK} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar
                    yAxisId="left"
                    dataKey="count"
                    name="Rejection Count"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    label={rejToggle ? <BarLabel /> : null}
                  />
                  <Line
                    yAxisId="right"
                    dataKey="pct"
                    name="Rejection %"
                    stroke="#f97316"
                    dot={{ fill: "#f97316", r: 5 }}
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                <span>🟠 Rejection %</span>
                <span className="chart-legend__item--blue">🔵 Rejection Count</span>
              </div>
            </ChartCard>
          </div>

          {/* ── Throughput ── */}
          <div className="throughput-card">
            <div className="throughput-card__header">
              <h2 className="throughput-card__title">Sorter ThroughPut (Time)</h2>
              <div className="chart-card__controls">
                <span className="toggle-label">Download</span>
                <button
                  className="chart-dl-btn"
                  title="Download Excel"
                  onClick={() => exportToExcel(hourlyChartData, "sorter_throughput", "Throughput")}
                >
                  <TfiDownload />
                </button>
              </div>
            </div>
            {hourlyLoading
              ? <div className="loading-state"><div className="loading-state__icon">⟳</div><div>Loading chart…</div></div>
              : hourlyChartData.length === 0
                ? <div className="throughput-empty">No throughput data for today</div>
                : <ParcelHourlyChart data={hourlyChartData} />
            }
          </div>

          {/* ── Bag Parcel Chart ── */}
          <div>
            <div className="bag-parcel mb-4">
              <BagParcelChart
                data={bagChartData}
                loading={bagChartLoading}
                onDownload={() => exportToExcel(bagChartData, "bag_with_total_parcel", "bag_data")}
              />
            </div>
          </div>
        </>
      )}

      {/* ── Filter Drawer ── */}
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onApply={handleApply}
        onQuickSelect={handleQuickSelect}
        current={currentFilter}
        activeLabel={activeLabel}
      />

      {/* ── AWB Search Modal ── */}
      {awbSearchOpen && (
        <AWBSearchModal onClose={() => setAwbSearchOpen(false)} />
      )}

    </div>
  );
}
