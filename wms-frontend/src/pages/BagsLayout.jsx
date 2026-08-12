import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Dialog } from "primereact/dialog";
import { ProgressSpinner } from "primereact/progressspinner";
import { Toast } from "primereact/toast";
import Button from "react-bootstrap/Button";
import { toast } from "react-toastify";
import "../styles/BagsLayout.css";
import { useMachine } from "../context/MachineContext";

const API_BASE = "http://localhost:5001/api";

const TOP_BINS = [
  ["D001", "D002", "D003"],
  ["D004", "D005", "D006"],
  ["D007", "D008", "D009"],
  ["D010", "D011", "D012"],
  ["D013", "D014", "D015"],
  ["D016", "D017", "D018"],
  ["D019", "D020", "D021"],
  ["D022", "D023", "D024"],
  ["D025", "D026", "D027"],
  ["D028", "D029", "D030"],
];

const LEFT_BOTTOM = [
  ["D031", "D032", "D033"],
  ["D034", "D035", "D036"],
  ["D037", "D038", "D039"],
  ["D040", "D041", "D042"],
];

const RIGHT_BOTTOM = [
  ["D043", "D044", "D045"],
  ["D046", "D047", "D048"],
  ["D049", "D050", "D051"],
];

const BagsLayout = () => {
  // Selected machine — global state from Navbar's dropdown. Bag codes
  // (D001, D002, ...) collide across machines, so machine_id must scope
  // EVERY call in this file, or you can view/clear the wrong machine's bag.
  const { selectedMachine } = useMachine();

  const [bags, setBags] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [selectedBag, setSelectedBag] = useState(null);
  const [bagWbns, setBagWbns] = useState([]);
  const [loadingWbns, setLoadingWbns] = useState(false);
  const [bagItemIds, setBagItemIds] = useState([]);

  const [clearingBag, setClearingBag] = useState(false);

  const toastRef = React.useRef(null);

  useEffect(() => {
    if (!selectedMachine) return; // wait until the machine list has loaded

    const fetchBags = async () => {
      try {
        const res = await axios.get(`${API_BASE}/bags/summary`, {
          params: { machine_id: selectedMachine },
        });
        setBags(res.data.bags || []);
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: "Error",
          detail: "Failed to load bags",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchBags();

    const interval = setInterval(fetchBags, 5000);

    return () => clearInterval(interval);
  }, [selectedMachine]); // re-fetch and re-poll when the machine changes

  const bagMap = useMemo(() => {
    const map = {};

    bags.forEach((b) => {
      map[b.bag_code] = b.count;
    });

    return map;
  }, [bags]);

  const openBag = async (code) => {
    setSelectedBag(code);
    setDialogVisible(true);
    setLoadingWbns(true);

    try {
      const res = await axios.get(`${API_BASE}/bags/${code}/wbns`, {
        params: { machine_id: selectedMachine },
      });

      console.log(res.data);

      setBagWbns(res.data.wbns || []);
      setBagItemIds(res.data.item_ids || []);
    } finally {
      setLoadingWbns(false);
    }
  };

  const renderBag = (code) => {
    const count = bagMap[code] || 0;

    return (
      <div
        key={code}
        className={`bag-wrapper`}
      >
        <div
          className={`bag-tile ${count > 0 ? "active" : ""}`}
          onClick={() => openBag(code)}
        >
          <span className="bag-count">{count}</span>
          <div className="bag-code">{code}</div>
        </div>
      </div>
    );
  };

  const renderColumn = (group) => {
    return (
      <div className="bag-column">
        {group.map((code) => renderBag(code))}
      </div>
    );
  };
  const handleClearBag = async () => {
    try {
      const confirmed = window.confirm(
        `Are you sure you want to clear bag ${selectedBag}?`
      );

      if (!confirmed) return;

      setClearingBag(true);

      // API CALL
      const res = await axios.delete(
        `${API_BASE}/bags/clear-bag/${selectedBag}`,
        { params: { machine_id: selectedMachine } }
      );
      // Remove all wbns from UI
      setBagWbns([]);
      toast.success("Clear Bag Successfully", {
        position: "bottom-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        style: {
          background: "linear-gradient(90deg, #ff7a00, #ff9f43)",
          color: "#fff",
          borderRadius: "14px",
          fontWeight: "700",
          padding: "14px 18px",
          boxShadow: "0 10px 25px rgba(255,122,0,0.35)",
        },
      })
    } catch (err) {
      toast.success("Error to Clear Bag", {
        position: "bottom-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        style: {
          background: "linear-gradient(90deg, #f42424, #f31010)",
          color: "#fff",
          borderRadius: "14px",
          fontWeight: "700",
          padding: "14px 18px",
          boxShadow: "0 10px 25px rgba(255,122,0,0.35)",
        },
      })
    } finally {

      setClearingBag(false);

    }
  };
  const handleClearAllBags = async () => {
    try {
      const confirmed = window.confirm(
        `Are you sure you want to clear all bags for ${selectedMachine?.toUpperCase()}?`
      );

      if (!confirmed) return;

      const res = await axios.delete(
        `${API_BASE}/bags/clear-bag`,
        { params: { machine_id: selectedMachine } }
      );
      toast.success("All bag Cleared", {
        position: "bottom-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        style: {
          background: "linear-gradient(90deg, #ff7a00, #ff9f43)",
          color: "#fff",
          borderRadius: "14px",
          fontWeight: "700",
          padding: "14px 18px",
          boxShadow: "0 10px 25px rgba(255,122,0,0.35)",
        },
      });

    } catch (err) {
      toast.success("error to clear", {
        position: "bottom-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        style: {
          background: "linear-gradient(90deg, #f42424, #f31010)",
          color: "#fff",
          borderRadius: "14px",
          fontWeight: "700",
          padding: "14px 18px",
          boxShadow: "0 10px 25px rgba(255,122,0,0.35)",
        },
      });
    }
  };

  return (
    <>
      <div className="bag-layout-title">
        <span className="bags-title">Bag Layout</span>

        <Button className="clear-btn" onClick={handleClearAllBags}>
          Clear All Bags
        </Button>
      </div>
      <div className="bags-page">
        <Toast ref={toastRef} />

        {loading ? (
          <div className="bags-loading">
            <ProgressSpinner />
          </div>
        ) : (
          <div className="layout-container">

            {/* ================= TOP ================= */}

            <div className="top-section">
              {TOP_BINS.map((group, i) => (
                <React.Fragment key={i}>
                  {renderColumn(group)}
                </React.Fragment>
              ))}
            </div>

            {/* ================= CARRIAGES ================= */}

            <div className="carriages">
              CARRIAGES
            </div>

            {/* ================= BOTTOM ================= */}

            <div className="bottom-section">

              {/* LEFT */}
              <div className="bottom-grid">
                {LEFT_BOTTOM.map((group, i) => (
                  <React.Fragment key={i}>
                    {renderColumn(group)}
                  </React.Fragment>
                ))}
              </div>

              {/* CENTER */}
              <div className="center-section">

                <div className="lifter">
                  LIFTER
                </div>

                <div className="id-row">
                  <div className="id-box">
                    ID
                    <br />
                    1
                  </div>

                  <div className="id-box">
                    ID
                    <br />
                    2
                  </div>
                </div>

              </div>

              {/* RIGHT */}
              <div className="bottom-grid">
                {RIGHT_BOTTOM.map((group, i) => (
                  <React.Fragment key={i}>
                    {renderColumn(group)}
                  </React.Fragment>
                ))}
              </div>

            </div>

          </div>
        )}

        <Dialog
          header={
            <div className="bag-dialog-header">
              <div className="bag-header-left">
                <div className="bag-icon">
                  <i className="pi pi-inbox"></i>
                </div>

                <div>
                  <h3>Bag Details</h3>
                  <p>Bag ID : {selectedBag}</p>
                </div>
              </div>

              {clearingBag && (
                <div className="clearing-status">
                  <ProgressSpinner
                    style={{ width: "22px", height: "22px" }}
                    strokeWidth="6"
                  />
                  <span>Please Wait...</span>
                </div>
              )}
            </div>
          }
          visible={dialogVisible}
          style={{ width: "48%"}}
          onHide={() => !clearingBag && setDialogVisible(false)}
          modal
          className="modern-bag-dialog"
        >
          {loadingWbns ? (

            <div className="dialog-loader-modern">
              <ProgressSpinner />
              <p>Loading Parcels...</p>
            </div>

          ) : bagWbns.length === 0 ? (

            <div className="empty-state-modern">

              <div className="empty-icon">
                <i className="pi pi-inbox"></i>
              </div>

              <h4>No Parcels Found</h4>

              <p>
                This bag currently does not contain any parcels.
              </p>

            </div>

          ) : (

            <div className="bag-content">

              {/* TOP INFO */}
              <div className="bag-summary-card">

                <div className="summary-item">
                  <span>Total Parcels</span>
                  <strong>{bagWbns.length}</strong>
                </div>

                <div className="summary-divider"></div>

                <div className="summary-item">
                  <span>Status</span>
                  <strong className="active-status">
                    Active
                  </strong>
                </div>

              </div>

              {/* LIST */}
              <div className="wbn-list-wrapper">

                <div className="wbn-list-header">
                  <span style={{ width: "60%" }}>Shipment WBNS</span>
                  <span style={{ width: "40%" }}>Item ID</span>
                </div>

                <ul className="wbn-list-modern">
                  {bagWbns.map((wbn, index) => (
                    <li key={index} className="wbn-item">
                      <div
                        style={{
                          display: "flex",
                          width: "100%",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            width: "60%",
                          }}
                        >
                          <span className="wbn-index">
                            #{index + 1}
                          </span>

                          <span className="wbn-code">
                            {wbn}
                          </span>
                        </div>

                        <div
                          style={{
                            width: "35%",
                            fontWeight: 600,
                            color: "#444",
                            textAlign: "left",
                          }}
                        >
                          {bagItemIds[index] || "-"}
                        </div>

                        <i className="pi pi-check-circle wbn-check"></i>
                      </div>
                    </li>
                  ))}
                </ul>

              </div>

              {/* FOOTER */}
              <div className="bag-dialog-footer">

                <Button
                  label="Close"
                  icon="pi pi-times"
                  className="bag-cancel-btn"
                  disabled={clearingBag}
                  onClick={() => setDialogVisible(false)}
                />

                <Button
                  variant="danger"
                  className="bag-clear-btn"
                  disabled={clearingBag}
                  onClick={handleClearBag}
                >
                  {clearingBag ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                      ></span>

                      Clearing...
                    </>
                  ) : (
                    <>
                      <i className="pi pi-trash me-2"></i>
                      Clear Bag
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </>
  );
};

export default BagsLayout;