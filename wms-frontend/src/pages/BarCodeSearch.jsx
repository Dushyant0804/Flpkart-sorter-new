import React, { useState } from "react";
import axios from "axios";

import {
  Card,
  Button,
  TextField,
  CircularProgress,
} from "@mui/material";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBarcode,
  faSearch,
} from "@fortawesome/free-solid-svg-icons";

import "../styles/BarCodeSearch.css";

function BarcodeLookup() {
  const [barcode, setBarcode] = useState("");
  const [loading, setLoading] = useState(false);
  const [parcelData, setParcelData] = useState(null);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!barcode.trim()) {
      setError("Please enter barcode");
      return;
    }

    setLoading(true);
    setError("");
    setParcelData(null);

    try {
      const response = await axios.get("http://10.240.112.35:5001/getBarCode", {
        params: {
          barCode: barcode,
        },
      });

      if (response.data?.success) {
        setParcelData(response.data.data);
      } else {
        setError(response.data?.message || "No Data Found");
      }
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        "No Data Found"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEnter = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="barcode-page">
      <div className="container-fluid">
        <div className="search-container">

          {/* Header */}
          <div className="search-header">
            <h2>
              <FontAwesomeIcon
                icon={faBarcode}
                className="me-2"
              />
              Barcode Lookup
            </h2>

            <p className="mb-0">
              Search parcel details using barcode.
            </p>
          </div>

          {/* Search Section */}
          <Card className="search-card">
            <div className="row g-3 align-items-center">

              <div className="col-lg-9 col-md-8">
                <TextField
                  fullWidth
                  label="Scan or Enter Barcode"
                  variant="outlined"
                  value={barcode}
                  onChange={(e) =>
                    setBarcode(e.target.value)
                  }
                  onKeyDown={handleEnter}
                />
              </div>

              <div className="col-lg-3 col-md-4">
                <Button
                  fullWidth
                  variant="contained"
                  className="search-btn"
                  startIcon={
                    <FontAwesomeIcon icon={faSearch} />
                  }
                  onClick={handleSearch}
                  disabled={loading}
                >
                  Search
                </Button>
              </div>

            </div>

            {/* Loader */}
            {loading && (
              <div className="loader-box">
                <CircularProgress
                  sx={{
                    color: "#ff6b00",
                  }}
                />

                <div className="mt-3">
                  Searching Parcel...
                </div>
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div className="no-data">
                {error}
              </div>
            )}

            {/* Result */}
            {!loading && parcelData && (
              <div className="result-card">

                <div className="result-header">
                  Parcel Information
                </div>

                <div className="result-body">

                  <div className="info-row">
                    <span className="info-label">WBN</span>
                    <span className="info-value">
                      {parcelData.wbn || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Item ID</span>
                    <span className="info-value">
                      {parcelData.item_id || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Infeed</span>
                    <span className="info-value">
                      {parcelData.infeed || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Length</span>
                    <span className="info-value">
                      {parcelData.length || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Width</span>
                    <span className="info-value">
                      {parcelData.width || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Height</span>
                    <span className="info-value">
                      {parcelData.height || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Weight</span>
                    <span className="info-value">
                      {parcelData.weight || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Volume</span>
                    <span className="info-value">
                      {parcelData.volume || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Real Volume</span>
                    <span className="info-value">
                      {parcelData.real_volume || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">
                      Expected Bag
                    </span>
                    <span className="info-value">
                      {parcelData.expected_bag || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">
                      Final Bag
                    </span>
                    <span className="info-value">
                      {parcelData.final_bag || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">
                      Sort Status
                    </span>
                    <span
                      className="info-value"
                      style={{
                        color:
                          parcelData.sort === "SORTED"
                            ? "#16a34a"
                            : "#dc2626",
                        fontWeight: "700",
                      }}
                    >
                      {parcelData.sort || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">
                      Reason
                    </span>
                    <span className="info-value">
                      {parcelData.reason || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">
                      Sort Time
                    </span>
                    <span className="info-value">
                      {parcelData.sorttime || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">
                      Created At
                    </span>
                    <span className="info-value">
                      {parcelData.created_at || "-"}
                    </span>
                  </div>

                </div>
              </div>
            )}
          </Card>

        </div>
      </div>
    </div>
  );
}

export default BarcodeLookup;
