import React, { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Settings from "./Settings";
import AccessDenied from "./AccessDenied";
import BagManagement from "./BagManagement";
import ConfigSettings from "./ConfigSettings";
import SortEvents from "./SortEvents";
import BagsLayout from "./BagsLayout";
import SortedParcels from "./SortedParcels";
import ProductionReport from "./ProductionReport";
import Parcels from "./Parcels";
import CalibrationLogs from "./CalibrationLogs";
import BagSealEvents from "./BagSealEvents";
import AlarmDashboard from "./AlarmDashboard";
import AlarmHistory from "./AlarmHistory";
import SorterDashboard from "./SorterDashboard";
import BarCodeSearch from "./BarCodeSearch";












const Dashboard = () => {
    const [activeComponent, setActiveComponent] = useState("Dashboard");
    const navigate = useNavigate();
    // useEffect(() => {
    //     const showCalibrationAlert = localStorage.getItem("showCalibrationAlert");
    //     if (showCalibrationAlert === "true") {

    //         axios.post("http://localhost:1880/calibration-status", {
    //             calibration: true,
    //             timestamp: new Date().toISOString()  // <-- Adds ISO timestamp
    //         })
    //         .then(() => {
    //             console.log("✅ Sent calibration alert to Node-RED");
    //         })
    //         .catch(err => {
    //             console.error("❌ Failed to send calibration status:", err.message);
    //         });
    //         axios.post("http://localhost:5001/api/calibration-status/update", {
                
    //             timestamp: new Date().toISOString()  // <-- Adds ISO timestamp
    //         })
    //         .then(() => {
    //             console.log("✅ Sent calibration status to backend");
    //         })
    //         .catch(err => {
    //             console.error("❌ Failed to send calibration status:", err.message);
    //         });
    //         Swal.fire({
    //             title: "Calibration Alert!",
    //             text: "Calibration is required. Please calibrate the machine.",
    //             icon: "warning",
    //             confirmButtonText: "OK"
    //         });
    //         localStorage.setItem("showCalibrationAlert", "false");
    //     }
    // }, []);

    if (!localStorage.getItem("token")) {
        return <Navigate to="/login" />;
    }
    const role = localStorage.getItem("role");


    const renderComponent = () => {
        switch (activeComponent) {
            case "Dashboard":
                return <SorterDashboard />;
            case "Settings":
                return <Settings />;
            case "Sort Events": 
                return <SortEvents />;
            case "Bag Management":
                return <BagManagement />;
            case "Bag Layout":
                return <BagsLayout />;
            case "Configuration Settings":
                return <ConfigSettings />;
            case "Sorted Parcels":
                return <SortedParcels />;
            case "Active Parcels":
                return <ProductionReport />;
            case "Parcels":
                return <Parcels />;
            case "Calibration":
                return <CalibrationLogs />;
            case "Closed Bags":
                return <BagSealEvents />;
            case "Alarms":
                return <AlarmDashboard setActiveComponent={setActiveComponent} />;  
            case "Alarm History":
                return <AlarmHistory />;   
            case "Barcode Lookup":
                return <BarCodeSearch />;  
            default:
                return <h3>{activeComponent} Page</h3>;
        }
    };

    

    return (
        <div className="dashboard-container">
            <Navbar />
            <div className="d-flex flex-grow-1">
                <div className="sidebar-container">
                    <Sidebar setActiveComponent={setActiveComponent} />
                </div>
                <div className="main-content">{renderComponent()}</div>
            </div>
        </div>
    );
};

export default Dashboard;
