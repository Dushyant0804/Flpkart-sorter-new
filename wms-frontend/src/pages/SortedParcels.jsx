import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import { Toast } from "primereact/toast";
import { Dialog } from "primereact/dialog";
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimesCircle,
} from "react-icons/fa";

import "primereact/resources/themes/saga-blue/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import { useMachine } from "../context/MachineContext";

import "../styles/SortedParcels.css";

const API_BASE = "http://localhost:5001/api";

const SortedParcels = () => {
  const { selectedMachine } = useMachine();
  const [data, setData] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(0);
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(50);

  // Search Input States
  const [searchWbn, setSearchWbn] = useState("");
  const [searchItemId, setSearchItemId] = useState("");

  const [payloadDialog, setPayloadDialog] = useState(false);
  const [selectedPayload, setSelectedPayload] = useState(null);

  const toastRef = useRef(null);

  // ---------------- Fetch Data ----------------
  const fetchData = useCallback(
    async (p = page, r = rows) => {
      try {
        setLoading(true);

        const params = {
          page: p + 1,
          limit: r,
          machine_id: selectedMachine || undefined,
          wbn: searchWbn?.trim() || undefined,
          item_id: searchItemId?.trim() || undefined,
        };

        const res = await axios.get(`${API_BASE}/sorted-parcels`, { params });
        if (res.data?.success) {
          setData(res.data.rows || []);
          setTotalRecords(res.data.total || 0);
        }
      } catch (err) {
        toastRef.current?.show({
          severity: "error",
          summary: "Error",
          detail: "Failed to load sorted parcels",
        });
      } finally {
        setLoading(false);
      }
    },
    [page, rows, searchWbn, searchItemId, selectedMachine]
  );

  // ── Debounced Auto-Search Effect ──────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
      setFirst(0);
      fetchData(0, rows);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchWbn, searchItemId, selectedMachine]);

  // ---------------- Actions ----------------
  const handleReset = () => {
    setSearchWbn("");
    setSearchItemId("");
    setPage(0);
    setFirst(0);
  };

  function fmtIST(utcStr) {
    if (!utcStr) return "—";
    return new Date(utcStr).toLocaleString("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  const resultTemplate = (row) => {
    const value = row.status?.toLowerCase();

    const config = {
      sorted: {
        icon: <FaCheckCircle />,
        className: "sp-prm-badge-sorted",
        label: "Sorted",
      },
      exception: {
        icon: <FaExclamationTriangle />,
        className: "sp-prm-badge-exception",
        label: "Exception",
      },
      rejected: {
        icon: <FaTimesCircle />,
        className: "sp-prm-badge-rejected",
        label: "Rejected",
      },
    };

    const item = config[value] || {
      icon: null,
      className: "sp-prm-badge-default",
      label: row.status || "—",
    };

    return (
      <span className={`sp-prm-badge ${item.className}`}>
        <span className="sp-prm-badge-content">
          <span className="sp-prm-badge-icon">{item.icon}</span>
          <span className="badge-text">{item.label}</span>
        </span>
      </span>
    );
  };

  // ---------------- Templates ----------------
  const payloadTemplate = (payloadData) => (
    <div className="view-btn-wrapper">
      <Button
        label="View"
        icon="pi pi-eye"
        className="view-icon-btn"
        onClick={() => {
          setSelectedPayload(payloadData);
          setPayloadDialog(true);
        }}
      />
    </div>
  );

  // ---------------- UI ----------------
  return (
    <div className="sp-prm-page">
      <Toast ref={toastRef} />

      {/* Header */}
      <div className="sp-prm-header">
        <div>
          <h2>Sorted Parcels</h2>
          <p>Successfully sorted payload records</p>
        </div>

        {/* Premium Search Actions Bar */}
        <div className="sp-prm-actions">
          {/* Search WBN */}
          <div className="sp-prm-search-wrapper">
            <i className="pi pi-search sp-prm-search-icon" />
            <InputText
              className="sp-prm-search-input"
              value={searchWbn}
              onChange={(e) => setSearchWbn(e.target.value)}
              placeholder="Search WBN..."
            />
            {searchWbn && (
              <button
                className="sp-prm-search-clear"
                onClick={() => setSearchWbn("")}
                title="Clear WBN search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Search Item ID */}
          <div className="sp-prm-search-wrapper">
            <i className="pi pi-box sp-prm-search-icon" />
            <InputText
              className="sp-prm-search-input"
              value={searchItemId}
              onChange={(e) => setSearchItemId(e.target.value)}
              placeholder="Search Item ID..."
            />
            {searchItemId && (
              <button
                className="sp-prm-search-clear"
                onClick={() => setSearchItemId("")}
                title="Clear Item ID search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Reset Button */}
          <Button
            label="Reset"
            icon="pi pi-refresh"
            className="sp-prm-reset-btn"
            onClick={handleReset}
          />
        </div>
      </div>

      {/* Table Card */}
      <div className="sp-prm-table-card">
        <DataTable
          value={data}
          paginator
          lazy
          first={first}
          rows={rows}
          totalRecords={totalRecords}
          loading={loading}
          rowsPerPageOptions={[50, 100, 200]}
          onPage={(e) => {
            setFirst(e.first);
            setRows(e.rows);
            setPage(e.page);
            fetchData(e.page, e.rows);
          }}
          scrollable
          scrollHeight="65vh"
        >
          <Column
            field="wbn"
            header="WBN"
            style={{ minWidth: 155 }}
            body={(r) => r.wbn || <span className="pd-cell-muted">—</span>}
          />
          <Column
            field="item_id"
            header="Item ID"
            style={{ minWidth: 155 }}
            body={(r) => r.item_id || <span className="pd-cell-muted">—</span>}
          />
          <Column
            field="chute_id"
            header="Chute ID"
            style={{ minWidth: 155 }}
            body={(r) => r.chute_id || <span className="pd-cell-muted">—</span>}
          />
          <Column
            field="status"
            header="Status"
            style={{ width: "160px", textAlign: "center" }}
            body={(r) => resultTemplate(r) || <span className="pd-cell-muted">—</span>}
          />
          <Column
            field="reason"
            header="Reason"
            style={{ minWidth: 155 }}
            body={(r) => r.reason || <span className="pd-cell-muted">—</span>}
          />
          <Column
            field="source"
            header="Source"
            style={{ minWidth: 155 }}
            body={(r) => r.source || <span className="pd-cell-muted">—</span>}
          />
          <Column
            field="inductapi_sent"
            header="Induct API Sent"
            style={{ minWidth: 155 }}
            body={(r) =>
              r.inductapi_sent === true ? (
                <span className="pr-bag-tag--final">true</span>
              ) : (
                <span className="pr-reason-tag">false</span>
              )
            }
          />
          <Column
            header="Induct Payload"
            body={(r) => payloadTemplate(r.induct_payload)}
            style={{ minWidth: 155 }}
          />
          <Column
            header="Induct Response"
            body={(r) => payloadTemplate(r.induct_response)}
            style={{ minWidth: 155 }}
          />
          <Column
            header="Drop Notification Payload"
            body={(r) => payloadTemplate(r.drop_notification_payload)}
          />
          <Column
            header="Drop Notification Response"
            body={(r) => payloadTemplate(r.drop_notification_response)}
          />
          <Column
            field="drop_time"
            header="Drop Time"
            style={{ minWidth: 200 }}
            body={(r) => r.drop_time || <span className="pd-cell-muted">—</span>}
          />
          <Column
            field="drop_notification_sent"
            header="Drop Notification Sent"
            style={{ minWidth: 155 }}
            body={(r) =>
              r.drop_notification_sent === true ? (
                <span className="pd-cell-muted pr-bag-tag--final">true</span>
              ) : (
                <span className="pd-cell-muted pr-reason-tag">false</span>
              )
            }
          />
          <Column
            header="Created (IST)"
            style={{ minWidth: 155 }}
            body={(r) => fmtIST(r.created_at)}
          />
        </DataTable>
      </div>

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

export default SortedParcels;