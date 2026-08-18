import React, { useEffect, useState } from "react";
import axios from "axios";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faMicrochip,
    faMemory,
    faHardDrive,
    faNetworkWired,
    faTemperatureHalf,
    faClockRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import {
    CircularProgressbar,
    buildStyles,
} from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import "../styles/SystemHealth.css";

const iconMap = {
    "CPU Usage":    { icon: faMicrochip,      accent: "amber" },
    "Memory Usage": { icon: faMemory,         accent: "green" },
    "Disk Usage":   { icon: faHardDrive,      accent: "brass" },
    "Network":      { icon: faNetworkWired,   accent: "red" },
};

const ACCENT_HEX = {
    amber: "#1827d1",
    green: "#16A34A",
    brass: "#F4600A",
    red:   "#E24A3A",
};

export default function SystemHealth() {
    const [systemHealth, setSystemHealth] = useState([]);
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);

    const getSystemHealth = async () => {
        try {
            setLoading(true);
            const response = await axios.get("http://localhost:5001/api/system-health");
            const data = response.data.data.map((item) => ({
                ...item,
                icon: iconMap[item.title]?.icon,
                accent: iconMap[item.title]?.accent || "amber",
            }));

            setSystemHealth(data);
            setLastUpdated(new Date());
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        getSystemHealth();
        const interval = setInterval(getSystemHealth, 5000);
        return () => clearInterval(interval);
    }, []);

    if (loading && systemHealth.length === 0) {
        return (
            <div className="sysh-loading">
                <div className="sysh-spinner" />
                <span>Loading system health…</span>
            </div>
        );
    }

    return (
        <div className="sysh-page">

            {/* ═══════════ HEADER ═══════════ */}
            <div className="sysh-header">
                <div className="sysh-header__left">
                    <h2 className="sysh-header__title">System Health</h2>
                    <p className="sysh-header__subtitle">Real-Time Infrastructure Monitoring</p>
                    <p className="sysh-header__timestamp">
                        Last updated: {lastUpdated ? lastUpdated.toLocaleString() : "—"}
                    </p>
                </div>

                <div className="sysh-header__right">
                    <span className="sysh-live-badge">
                        <span className="sysh-live-dot" />
                        LIVE
                    </span>
                    <button className="sysh-refresh-btn" onClick={getSystemHealth} disabled={loading}>
                        {loading ? "↻ Refreshing…" : "↻ Refresh"}
                    </button>
                </div>
            </div>

            {/* ═══════════ METRIC CARDS ═══════════ */}
            <div className="sysh-grid">
                {systemHealth.map((item) => {
                    const hex = ACCENT_HEX[item.accent];
                    return (
                        <div className="sysh-card" key={item.title} style={{ "--accent": hex }}>
                            <div className="sysh-card__topbar" />

                            <div className="sysh-card__icon">
                                <FontAwesomeIcon icon={item.icon} />
                            </div>

                            <div className="sysh-card__gauge">
                                <CircularProgressbar
                                    value={item.value}
                                    text={`${item.value}%`}
                                    styles={buildStyles({
                                        pathColor: hex,
                                        trailColor: "rgba(36,28,21,.08)",
                                        textColor: "#241C15",
                                        textSize: "18px",
                                        strokeLinecap: "round",
                                        pathTransitionDuration: 0.6,
                                    })}
                                />
                            </div>

                            <div className="sysh-card__title">{item.title}</div>

                            <div className="sysh-card__status-row">
                                <span className="sysh-status-chip">{item.status}</span>
                            </div>

                            <div className="sysh-card__divider" />

                            <div className="sysh-card__stats">
                                <div className="sysh-stat">
                                    <FontAwesomeIcon icon={faTemperatureHalf} className="sysh-stat__icon" />
                                    <span className="sysh-stat__label">Temperature</span>
                                    <span className="sysh-stat__value">{item.temperature}</span>
                                </div>
                                <div className="sysh-stat">
                                    <FontAwesomeIcon icon={faClockRotateLeft} className="sysh-stat__icon" />
                                    <span className="sysh-stat__label">Uptime</span>
                                    <span className="sysh-stat__value">{item.uptime}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}