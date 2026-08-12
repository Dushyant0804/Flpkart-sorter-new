import React, { useState, useEffect } from "react";
import axios from "axios";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCheckCircle,
    faTimesCircle,
    faBell,
    faBellSlash,
    faBarcode,
    faBan,
    faDatabase,
    faExclamationTriangle,
    faUserCircle,
    faGlobe,
    faMicrochip,
    faCircle
} from "@fortawesome/free-solid-svg-icons";
import { Select, MenuItem, FormControl } from "@mui/material";
import "../styles/Navbar.css";
import logo from "../assets/mechint_logo.jpeg";
import { useMachine } from "../context/MachineContext";

const ORANGE = "#ff8c00";
const ORANGE_DARK = "#e07b00";

const Navbar = () => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [username, setUsername] = useState("");
    const [machineStatus, setMachineStatus] = useState({
        plc: 0,
        scanner: 0,
        alarm: 0,
        WEIGHING_CONVEYOR_EXIT_SENSOR_JAM_ERROR: 0,
    });
    const [isInternetOnline, setIsInternetOnline] = useState(navigator.onLine);

    // Machine selector -- global state, drives every page's data.
    const { machines, selectedMachine, setSelectedMachine, loading: machinesLoading } = useMachine();

    const renderStatusIcon = (iconOk, iconFail, value) => (
        <FontAwesomeIcon
            icon={value === 0 ? iconOk : iconFail}
            className={value === 0 ? 'text-success' : 'text-danger'}
        />
    );

    return (
<nav
  className="navbar custom-navbar px-4"
  style={{
    minHeight: "72px",
  }}
>
<div className="navbar-brand-wrap">
  <div className="navbar-logo-box">
    <img
      src={logo}
      alt="Company Logo"
      className="navbar-logo"
    />
  </div>

  <div className="navbar-brand-content">
    <span className="navbar-title">
      MECHINT | Mechatronics International
    </span>

    <span className="navbar-subtitle mt-2">
     BUILDING THE FUTURE OF SMART AUTOMATION
    </span>
  </div>
</div>

  <div className="d-flex align-items-center">

    {/* Machine selector -- horizontal label + MUI dropdown, live chip alongside */}
    <div className="machine-console mx-3">

      <div className="machine-console__select-row">
        <span className="machine-console__label">
          <FontAwesomeIcon icon={faMicrochip} className="machine-console__label-icon" />
          MACHINE
        </span>

        <FormControl size="small">
          <Select
            value={selectedMachine || ""}
            onChange={(e) => setSelectedMachine(e.target.value)}
            disabled={machinesLoading || machines.length === 0}
            displayEmpty
            MenuProps={{
              PaperProps: {
                sx: {
                  bgcolor: "#ffffff",
                  border: `1px solid ${ORANGE}33`,
                  borderRadius: "10px",
                  boxShadow: "0 8px 24px rgba(255,140,0,0.18)",
                  mt: 0.5,
                },
              },
            }}
            sx={{
              minWidth: 120,
              bgcolor: "#ffffff",
              borderRadius: "10px",
              fontWeight: 800,
              fontSize: "0.92rem",
              color: "#1a1a1a",
              letterSpacing: "0.02em",
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: `${ORANGE}59`,
                borderWidth: "1.5px",
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: ORANGE,
              },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: ORANGE,
                borderWidth: "1.5px",
              },
              "& .MuiSelect-select": {
                padding: "8px 14px",
              },
              "& .MuiSvgIcon-root": {
                color: ORANGE,
              },
              "&.Mui-disabled": {
                opacity: 0.55,
              },
            }}
          >
            {machines.length === 0 && (
              <MenuItem value="" disabled sx={{ fontSize: "0.88rem" }}>
                {machinesLoading ? "Loading…" : "No machines"}
              </MenuItem>
            )}
            {machines.map((m) => (
              <MenuItem
                key={m}
                value={m}
                sx={{
                  fontWeight: 700,
                  fontSize: "0.88rem",
                  color: "#1a1a1a",
                  "&:hover": {
                    bgcolor: "#fff3e6",
                  },
                  "&.Mui-selected": {
                    bgcolor: "#ffe6cc",
                    color: ORANGE_DARK,
                  },
                  "&.Mui-selected:hover": {
                    bgcolor: "#ffdcb3",
                  },
                }}
              >
                {m.toUpperCase()}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </div>

      {/* Live readout -- orange & white themed status chip, sits beside the dropdown */}
      {selectedMachine && (
        <div className="machine-readout" role="status" aria-live="polite">
          <span className="machine-readout__dot" aria-hidden="true">
            <FontAwesomeIcon icon={faCircle} />
          </span>
          <span className="machine-readout__label">LIVE</span>
          <span className="machine-readout__id">{selectedMachine.toUpperCase()}</span>
        </div>
      )}
    </div>

<div className="username-box">
  <div className="username-box__avatar">
    <img
      src="https://png.pngtree.com/png-vector/20230509/ourmid/pngtree-personal-flat-icon-vector-png-image_7092615.png"
      alt="admin"
      className="username-box__avatar-img"
    />
  </div>

  <div className="username-box__content">
    <span className="username-box__label">Welcome back</span>
<span className="username-box__name">
  {username
    ? username.charAt(0).toUpperCase() + username.slice(1)
    : "Unknown User"}
</span>
  </div>

  <div className="username-box__status"></div>
</div>

    <div className="status-box mx-3">
      <FontAwesomeIcon
        icon={faGlobe}
        className={isInternetOnline ? "text-success" : "text-danger"}
        title="Internet Status"
      />
      <span className="ms-2">Internet</span>
    </div>

    <div className="time-box ms-3">
      {currentTime.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).replace(/\//g, "-")}
    </div>
  </div>

  <style>{`
    .machine-console {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .machine-console__select-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .machine-console__label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.72rem;
      font-weight: 800;
      color: #b36b00;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      white-space: nowrap;
    }

    .machine-console__label-icon {
      font-size: 0.75rem;
      color: #ff8c00;
    }

    /* Live readout chip -- orange & white, sits beside the dropdown */
    .machine-readout {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 14px;
      border-radius: 999px;
      background: #ffffff;
      border: 1.5px solid #ff8c00;
      box-shadow: 0 2px 10px rgba(255, 140, 0, 0.22);
      animation: readout-in 0.25s ease-out;
      white-space: nowrap;
    }

    .machine-readout__dot {
      display: inline-flex;
      color: green;
      font-size: 1rem;
      animation: readout-pulse 1.6s ease-in-out infinite;
    }

    .machine-readout__label {
      font-size: 0.64rem;
      font-weight: 800;
      color: #e07b00;
      letter-spacing: 0.1em;
    }

    .machine-readout__id {
      font-size: 0.86rem;
      font-weight: 800;
      color: #1a1a1a;
      letter-spacing: 0.03em;
      padding-left: 6px;
      border-left: 1.5px solid #ffd9a8;
    }

    @keyframes readout-pulse {
      0%, 100% { opacity: 1; text-shadow: 0 0 6px rgba(255, 140, 0, 0.7); }
      50%      { opacity: 0.35; text-shadow: 0 0 2px rgba(255, 140, 0, 0.3); }
    }

    @keyframes readout-in {
      from { opacity: 0; transform: translateX(-4px) scale(0.97); }
      to   { opacity: 1; transform: translateX(0) scale(1); }
    }

    @media (prefers-reduced-motion: reduce) {
      .machine-readout__dot,
      .machine-readout { animation: none; }
    }
  `}</style>
</nav>
    );
};

export default Navbar;
