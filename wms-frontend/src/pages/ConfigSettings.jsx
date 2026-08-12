// src/pages/ConfigSettings.jsx

import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";

import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { InputSwitch } from "primereact/inputswitch";
import { Dialog } from "primereact/dialog";
import { ProgressSpinner } from "primereact/progressspinner";
import { Toast } from "primereact/toast";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";

import Swal from "sweetalert2";

import "primereact/resources/themes/saga-blue/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";

import "../styles/configSettings.css";

const API_BASE = "http://10.240.112.35:5001/api";

const ConfigSettings = () => {

  const [configs, setConfigs] = useState([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [viewVisible, setViewVisible] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);

  const [viewData, setViewData] = useState({
    columns: [],
    rows: [],
    totalRows: 0,
  });

  const [viewTitle, setViewTitle] = useState("");

  const toastRef = React.useRef(null);

  // ---------------------------------------------------
  // FETCH CONFIGS
  // ---------------------------------------------------
const fetchConfigs = useCallback(async () => {

  try {

    setLoadingConfigs(true);

    const res = await axios.get(
      `${API_BASE}/configs/ptl`
    );

    const rows = Array.isArray(res.data)
      ? res.data
      : (res.data?.data || []);

    setConfigs(rows);

  } catch (err) {

    console.error(err);

    setConfigs([]);

    toastRef.current?.show({
      severity: "error",
      summary: "Error",
      detail: "Failed to load configurations.",
      life: 4000,
    });

  } finally {

    setLoadingConfigs(false);

  }

}, []);

// ---------------------------------------------------
// AUTO REFRESH
// ---------------------------------------------------
useEffect(() => {

  // stop polling during upload
  if (uploading) return;

  const interval = setInterval(() => {

    fetchConfigs();

  }, 5000);

  return () => clearInterval(interval);

}, [fetchConfigs, uploading]);

  // ---------------------------------------------------
  // FILE CHANGE
  // ---------------------------------------------------
  const handleFileChange = (e) => {

    const f = e.target.files?.[0];

    setFile(f || null);

  };

  // ---------------------------------------------------
  // SAMPLE DOWNLOAD
  // ---------------------------------------------------
  const handleSampleDownload = () => {

    window.location.href =
      `${API_BASE}/configs/chute/sample/download`;

  };

  // ---------------------------------------------------
  // UPLOAD
  // ---------------------------------------------------
// ---------------------------------------------------
// UPLOAD
// ---------------------------------------------------
const handleUpload = async () => {

  if (!file) {

    toastRef.current?.show({
      severity: "warn",
      summary: "No File",
      detail: "Please select a CSV file first.",
      life: 3000,
    });

    return;
  }

  const formData = new FormData();

  formData.append("file", file);

  try {

    setUploading(true);

    // IMPORTANT:
    // don't manually set multipart headers
    const res = await axios.post(
      `${API_BASE}/configs/chute/upload`,
      formData
    );

    if (res.data?.success) {

      toastRef.current?.show({
        severity: "success",
        summary: "Upload Started",
        detail: "Configuration is being processed in background.",
        life: 4000,
      });

      setFile(null);

      // clear browser file handle
      const input = document.querySelector(
        ".cs-upload-file-input"
      );

      if (input) {
        input.value = "";
      }

      await fetchConfigs();

      return;
    }

    throw new Error("Upload failed");

  } catch (err) {

    console.error("Chute Upload Error:", err);

    const data = err?.response?.data;

    // ---------------------------------------------------
    // VALIDATION ERRORS
    // ---------------------------------------------------
    if (
      Array.isArray(data?.errors) &&
      data.errors.length > 0
    ) {

      Swal.fire({
        icon: "error",
        title: "CSV Validation Failed",

        html: `
        <div style="text-align:left; max-height:320px; overflow:auto;">
          ${data.errors.map(
            e => `
              <div style="margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #ddd;">
                <b>Row ${e.row}</b><br/>
                <b>Field:</b> ${e.field}<br/>
                <b>Value:</b> ${e.value}<br/>
                <b>Error:</b> ${e.message}
              </div>
            `
          ).join("")}
        </div>
        `,

        width: 760,
        confirmButtonText: "Fix CSV",
      });

      return;
    }

    // ---------------------------------------------------
    // NETWORK ERROR
    // ---------------------------------------------------
    if (err.code === "ERR_NETWORK") {

      toastRef.current?.show({
        severity: "error",
        summary: "Backend Not Reachable",

        detail:
          "Cannot connect to backend server. Check if Fastify server is running.",

        life: 6000,
      });

      return;
    }

    // ---------------------------------------------------
    // GENERAL ERROR
    // ---------------------------------------------------
    toastRef.current?.show({
      severity: "error",
      summary: "Upload Failed",

      detail:
        data?.message ||
        data?.reason ||
        data?.error ||
        err.message ||
        "Failed to upload CSV.",

      life: 5000,
    });

  } finally {

    setUploading(false);

  }
};

  // ---------------------------------------------------
  // ACTIVATE / DEACTIVATE
  // ---------------------------------------------------
  const handleActivateToggle = async (cfg, value) => {

    // ---------------------------------------------------
    // DEACTIVATE
    // ---------------------------------------------------
    if (!value) {

      try {

        const res = await axios.post(
          `${API_BASE}/configs/chute/${cfg.id}/deactivate`
        );

        if (res.data?.success) {

          toastRef.current?.show({
            severity: "success",
            summary: "Deactivated",
            detail: `${cfg.name} has been deactivated.`,
            life: 3000,
          });

          await fetchConfigs();

        } else {

          throw new Error(
            res.data?.error || "Deactivation failed"
          );
        }

      } catch (err) {

        const backendMsg =
          err.response?.data?.error ||
          err.message ||
          "Deactivation failed";

        Swal.fire({
          icon: "warning",
          title: "Cannot Deactivate Config",

          html: `
            <div style="text-align:left">
              <p>${backendMsg}</p>

              ${err.response?.data?.bags
                ? `
                  <b>Bags with parcels:</b><br/>
                  ${err.response.data.bags.join("<br/>")}
                `
                : ""
              }
            </div>
          `,

          confirmButtonText: "OK",
        });
      }

      return;
    }

    // ---------------------------------------------------
    // ACTIVATE
    // ---------------------------------------------------
const freshRes = await axios.get(
  `${API_BASE}/configs/chute`
);

const fresh = Array.isArray(freshRes.data)
  ? freshRes.data
  : (freshRes.data?.data || []);

    const activeOther = fresh.find(
      c => c.is_active && c.id !== cfg.id
    );

    if (activeOther) {

      confirmDialog({
        header: "Another configuration is active",

        message:
          "Please deactivate the currently active configuration first.",

        icon: "pi pi-exclamation-triangle",

        acceptLabel: "OK",

        rejectClassName: "p-hidden",

        accept: () => { },
      });

      return;
    }

    try {

      const res = await axios.post(
        `${API_BASE}/configs/chute/${cfg.id}/activate`
      );

      if (res.data?.success) {

        toastRef.current?.show({
          severity: "success",
          summary: "Activated",
          detail: `${cfg.name} is now active.`,
          life: 3000,
        });

        await fetchConfigs();
      }

    } catch (err) {

      toastRef.current?.show({
        severity: "error",
        summary: "Activation Error",

        detail:
          err.response?.data?.error ||
          err.message,

        life: 5000,
      });
    }
  };

  // ---------------------------------------------------
  // ACTIVATE SWITCH
  // ---------------------------------------------------
  const activateBodyTemplate = (rowData) => {

    const disabled =
      rowData.status !== "READY";

    return (
      <div className="cs-activate-cell">

        <InputSwitch
          checked={!!rowData.is_active}
          disabled={disabled}
          onChange={(e) =>
            handleActivateToggle(rowData, e.value)
          }
        />

      </div>
    );
  };

  // ---------------------------------------------------
  // STATUS
  // ---------------------------------------------------
  const statusTemplate = (rowData) => {

    const status = rowData.status;

    let cls =
      "cs-status-tag cs-status-processing";

    let label = status;

    if (status === "READY") {

      cls = "cs-status-tag cs-status-ready";
      label = "Ready";

    } else if (status === "ERROR") {

      cls = "cs-status-tag cs-status-error";
      label = "Error";

    } else if (status === "PROCESSING") {

      cls = "cs-status-tag cs-status-processing";
      label = "Processing";

    }

    return (
      <span className={cls}>
        {label}
      </span>
    );
  };

  // ---------------------------------------------------
  // DATE FORMAT
  // ---------------------------------------------------
  const formatDateTime = (value) => {

    if (!value) return "--";

    const d = new Date(value);

    if (isNaN(d.getTime())) return value;

    return d.toLocaleString();
  };

  const uploadedTemplate = (rowData) => (
    <span>
      {formatDateTime(rowData.uploaded_at)}
    </span>
  );

  const lastActivatedTemplate = (rowData) => (
    <span>
      {formatDateTime(rowData.last_activated_at)}
    </span>
  );

  const lastDeactivatedTemplate = (rowData) => (
    <span>
      {formatDateTime(rowData.last_deactivated_at)}
    </span>
  );

  // ---------------------------------------------------
  // VIEW
  // ---------------------------------------------------
  const handleView = async (cfg) => {

    try {

      setViewTitle(cfg.name);

      setViewVisible(true);

      setViewLoading(true);

      const res = await axios.get(
        `${API_BASE}/configs/chute/${cfg.id}/view`
      );
console.log("res is value is that is",res)
      const {
        columns,
        rows,
        totalRows,
      } = res.data || {};

      setViewData({
        columns: columns || [],
        rows: rows || [],
        totalRows:
          totalRows ||
          (rows ? rows.length : 0),
      });

    } catch (err) {

      console.error(err);

      toastRef.current?.show({
        severity: "error",
        summary: "View Error",
        detail: "Failed to load file preview.",
        life: 4000,
      });

      setViewVisible(false);

    } finally {

      setViewLoading(false);

    }
  };

  // ---------------------------------------------------
  // DOWNLOAD
  // ---------------------------------------------------
  const handleDownload = (cfg) => {
window.open(`${API_BASE}/configs/chute/${cfg.id}/download`, "_blank");

  };

  // ---------------------------------------------------
  // DELETE
  // ---------------------------------------------------
  const handleDelete = (cfg) => {

    confirmDialog({

      header: "Delete Configuration",

      message:
        `Are you sure you want to delete "${cfg.name}"?`,

      icon: "pi pi-trash",

      acceptClassName: "p-button-danger",

      acceptLabel: "Delete",

      accept: async () => {

        try {

          await axios.delete(
            `${API_BASE}/configs/chute/${cfg.id}`
          );

          toastRef.current?.show({
            severity: "success",
            summary: "Deleted",
            detail:
              "Configuration deleted successfully.",
            life: 3000,
          });

          fetchConfigs();

        } catch (err) {

          console.error(err);

          toastRef.current?.show({
            severity: "error",
            summary: "Delete Error",

            detail:
              err.response?.data?.error ||
              "Failed to delete configuration.",

            life: 4000,
          });
        }
      },
    });
  };

  // ---------------------------------------------------
  // ACTIONS
  // ---------------------------------------------------
  const actionsTemplate = (rowData) => (

    <div className="cs-actions">

      <Button
        icon="pi pi-eye"
        className="p-button-rounded p-button-text cs-btn-view"
        onClick={() => handleView(rowData)}
        tooltip="View file"
      />

      <Button
        icon="pi pi-download"
        className="p-button-rounded p-button-text cs-btn-download"
        onClick={() => handleDownload(rowData)}
        tooltip="Download file"
      />

      <Button
        icon="pi pi-trash"
        className="p-button-rounded p-button-text p-button-danger cs-btn-delete"

        onClick={() => handleDelete(rowData)}

        disabled={rowData.is_active}

        tooltip={
          rowData.is_active
            ? "Deactivate first to delete"
            : "Delete"
        }
      />

    </div>
  );

  // ---------------------------------------------------
  // UPLOAD CARD
  // ---------------------------------------------------
  const uploadCard = (

    <div className="cs-upload-card">

      <div className="cs-upload-dropzone">

        <div className="cs-upload-icon pi pi-upload" />

        <div className="cs-upload-text-main">
          Select a CSV file to upload
        </div>

        <div className="cs-upload-text-sub">
          or drag and drop it here
        </div>

        <label className="cs-upload-file-label">

          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="cs-upload-file-input"
          />

          <span className="cs-upload-file-button">
            {file ? file.name : "Choose File"}
          </span>

        </label>

      </div>

      <div className="cs-upload-actions">

        <Button
          label="Sample CSV"
          icon="pi pi-download"

          className="p-button-sm p-button-success cs-upload-sample-btn"

          onClick={handleSampleDownload}
        />

        <Button
          label={
            uploading
              ? "Uploading..."
              : "Upload CSV"
          }

          icon={
            uploading
              ? "pi pi-spin pi-spinner"
              : "pi pi-cloud-upload"
          }

          className="p-button-sm cs-upload-submit-btn"

          disabled={!file || uploading}

          onClick={handleUpload}
        />

      </div>

    </div>
  );

  // ---------------------------------------------------
  // DIALOG FOOTER
  // ---------------------------------------------------
  const previewFooter = (

    <div className="cs-dialog-footer">

      <Button
        label="Close"
        onClick={() => setViewVisible(false)}
      />

    </div>
  );

  // ---------------------------------------------------
  // RENDER
  // ---------------------------------------------------
  return (

    <div className="cs-page-wrapper">

      <div className="cs-page">

        <Toast ref={toastRef} />

        <ConfirmDialog />

        {/* HEADER */}

        <div className="cs-page-header">

          <div className="cs-page-title">
            Chute Config Settings
          </div>

          <div className="cs-page-subtitle">
            Manage chute configuration files and sorter mappings.
          </div>

        </div>

        {/* CONTENT */}

        <div className="cs-page-content">

          {uploadCard}

          {/* TABLE CARD */}

          <div className="cs-table-card">

            <div className="cs-table-header">

              <div className="cs-table-title">
                Chute Config Files
              </div>

              <div className="cs-table-subtitle">
                Activate one configuration at a time.
                Older configs can be re-activated.
              </div>

            </div>

            <DataTable
              value={configs}

              paginator

              rows={10}

              rowsPerPageOptions={[10, 20, 50]}

              loading={loadingConfigs}

              className="cs-table"

              responsiveLayout="stack"
            >

              <Column
                header="ACTIVATE"
                body={activateBodyTemplate}
                style={{ width: "120px" }}
              />

              <Column
                field="id"
                header="CONFIG ID"
                style={{ width: "110px" }}
              />

              <Column
                field="name"
                header="CONFIG NAME"
              />

              <Column
                field="type"
                header="CONFIG TYPE"
                style={{ width: "120px" }}
              />

              <Column
                header="STATUS"
                body={statusTemplate}
                style={{ width: "130px" }}
              />

              <Column
                header="UPLOADED TIME"
                body={uploadedTemplate}
              />

              <Column
                header="LAST ACTIVATED"
                body={lastActivatedTemplate}
              />

              <Column
                header="LAST DEACTIVATED"
                body={lastDeactivatedTemplate}
              />

              <Column
                header="ACTION"
                body={actionsTemplate}
                style={{ width: "150px" }}
              />

            </DataTable>

          </div>

        </div>

        {/* PREVIEW DIALOG */}

        <Dialog
          visible={viewVisible}

          onHide={() => setViewVisible(false)}

          header={`Preview - ${viewTitle}`}

          className="cs-dialog"

          footer={previewFooter}

          maximizable

          modal
        >

          {viewLoading ? (

            <div className="cs-dialog-loading">

              <ProgressSpinner />

              <span>Loading full file...</span>

            </div>

          ) : (

            <div className="cs-dialog-table-wrapper">

              {viewData.rows.length === 0 ? (

                <div className="cs-dialog-empty">
                  No data found in file.
                </div>

              ) : (

                <DataTable
                  value={viewData.rows}

                  scrollable

                  scrollHeight="60vh"

                  className="cs-dialog-table"
                >

                  {viewData.columns.map((col) => (

                    <Column
                      key={col}
                      field={col}
                      header={col}
                      style={{ width: "180px" }}
                    />

                  ))}

                </DataTable>

              )}

            </div>

          )}

        </Dialog>

      </div>

    </div>
  );
};

export default ConfigSettings;