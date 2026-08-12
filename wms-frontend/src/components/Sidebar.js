import React, { useState,useEffect,useRef  } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "react-router-dom";
import { faSignOutAlt } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import {
     faBarcode,
    faWarehouse,
    faRobot,
    faChevronDown,
    faChevronRight,
    faSliders,
    faBox,
    faCog,
    faChartLine,
} from "@fortawesome/free-solid-svg-icons";
import { icon } from "@fortawesome/fontawesome-svg-core";

const Sidebar = ({ setActiveComponent }) => {
    const [isBinsOpen, setIsBinsOpen] = useState(false);
    const [activeMenu, setActiveMenu] = useState("Dashboard");
let components;
if(localStorage.getItem('role') == 'admin') {
 components = [
        { name: "Dashboard", icon: faChartLine },
        { name: "Parcels", icon: faBox },
        // { name: "Calibration", icon: faSliders },
        { name: "Active Parcels", icon: faChartLine },
        { name: "Alarms", icon: faRobot},
//         {
//   name: "Barcode Lookup",
//   icon: faBarcode
// },
        // { name: "Alarm History", icon: faRobot},
        { name: "Closed Bags", icon: faRobot},
        { name: "Settings", icon: faCog},
        // { name: "Bag Management", icon: faBox},
         { name: "Bag Layout", icon: faBox},
        // { name: "Sort Events", icon: faBox},
        // { name: "Configuration Settings", icon: faCog},
        { name: "Sorted Parcels", icon: faBox},
    ];

} else {
components = [
        { name: "Dashboard", icon: faChartLine },
        { name: "Parcels", icon: faBox },
        // { name: "Calibration", icon: faSliders },
        { name: "Payload Status", icon: faChartLine },
        // { name: "Alarms", icon: faRobot},
//         {
//   name: "Barcode Lookup",
//   icon: faBarcode
// },
        // { name: "Alarm History", icon: faRobot},
        { name: "Closed Bags", icon: faRobot},
        // { name: "Bag Management", icon: faBox},
        // { name: "Bag Layout", icon: faBox},
        // { name: "Sort Events", icon: faBox},
        // { name: "Configuration Settings", icon: faCog},
        { name: "Sorted Parcels", icon: faBox},
    ];
}    
const navigate = useNavigate();
const timerRef = useRef(null);
// useEffect(() => {
//     const role = localStorage.getItem("role");

//     // Sirf admin ke liye
//     if (role !== "admin") {
//         return;
//     }

//     const logout = () => {
//         localStorage.removeItem("token");
//         localStorage.removeItem("username");
//         localStorage.removeItem("role");
//         navigate("/login");
//     };

//     let timer;

//     const resetTimer = () => {
//         clearTimeout(timer);

//         timer = setTimeout(() => {
//             logout();
//         }, 30000);
//     };

//     const events = [
//         "mousemove",
//         "mousedown",
//         "keypress",
//         "scroll",
//         "touchstart"
//     ];

//     events.forEach(event =>
//         window.addEventListener(event, resetTimer)
//     );

//     resetTimer();

//     return () => {
//         clearTimeout(timer);

//         events.forEach(event =>
//             window.removeEventListener(event, resetTimer)
//         );
//     };
// }, [navigate]);

    const handleBinsClick = (e) => {
        e.stopPropagation();
        setIsBinsOpen(!isBinsOpen);
    };

    const handleLogout = () => {
        axios.post('http://localhost:1880/login-code', {
            code: true
        }).then(() => {
            console.log("✅ Login code true sent to Node-RED");
        }).catch((err) => {
            console.log(err)
            console.error("❌ Failed to notify login code:", err.message);
        });
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        navigate("/login");
    };

    return (
        <>
            <style>
                {`  
.sidebar-container {
        width: 250px;
        height: 100vh;
        overflow:auto;
        position: relative;
        background: linear-gradient(135deg, #fff8f7 0%, #f8fafc 50%, #f1f5f9 100%);
        border-right: 1px solid rgba(255, 165, 0, 0.15);
        box-shadow: 4px 0 20px rgba(0, 0, 0, 0.35);
        margin-bottom : 25%
    }
    .sidebar-item {
    font-family: 'Inter', sans-serif;
    font-size: 15px;
    cursor: pointer;
    transition: all 0.25s ease;
    border-radius: 12px;
    padding: 12px 16px;
    color: #111827 !important;
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 6px;
    font-weight: 600;
    letter-spacing: 0;
    position: relative;
    overflow: hidden;
    background: transparent;
}
.sidebar-item::before {
        content: "";
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 166, 0, 0.18),
            transparent
        );
        transition: 0.5s;
    }
    .sidebar-item:hover::before {
        left: 100%;
    }

    /* Hover Styling */
    .sidebar-item:hover {
        background: linear-gradient(
            90deg,
            #ff8c00,
            #ffb347
        ) !important;
        color: #111 !important;
        transform: translateX(6px);
        box-shadow: 0 4px 14px rgba(255, 140, 0, 0.35);
    }

    /* Active Feel */
    .sidebar-item:active {
        transform: scale(0.98);
    }

    /* ===== Icons ===== */
    .sidebar-icon {
        width: 22px;
        text-align: center;
        font-size: 1rem;
        color: #ffb347;
        transition: all 0.25s ease;
    }

    .sidebar-item:hover .sidebar-icon {
        color: #111;
        transform: scale(1.15);
    }

    /* ===== Sub Items ===== */
    .sub-item {
        padding-left: 2.3rem;
        font-size: 0.84rem;
        background: rgba(255, 255, 255, 0.02);
        border-left: 2px solid rgba(255, 166, 0, 0.4);
        margin-left: 8px;
    }

    .sub-item:hover {
        background: linear-gradient(
            90deg,
            #ffa726,
            #ffd180
        ) !important;
    }
        

    /* ===== Dropdown Icon ===== */
    .dropdown-icon {
        margin-left: auto;
        transition: transform 0.3s ease;
        color: #ffb347;
    }

    .dropdown-icon.open {
        transform: rotate(90deg);
    }

    /* ===== Logout Button ===== */
    .logout-button {
        position: absolute;
        bottom: 1%;
        left: 14px;
        width: 180px;
        padding: 12px 14px;
        background: linear-gradient(
            90deg,
            #ff7b00,
            #ffb347
        );
        color: #111;
        border: none;
        border-radius: 14px;
        font-size: 0.95rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        transition: all 0.3s ease;
        box-shadow: 0 4px 14px rgba(255, 140, 0, 0.35);
    }

    .logout-button:hover {
        transform: translateY(-3px) scale(1.03);
        box-shadow: 0 8px 20px rgba(255, 166, 0, 0.45);
        background: linear-gradient(
            90deg,
            #ff9800,
            #ffd180
        );
        color: black;
    }

    .logout-button:active {
        transform: scale(0.97);
    }
    .sidebar-item.active {
    background: linear-gradient(90deg, #ff8c00, #ffb347) !important;
    color: #111 !important;
    // color: #111 !important;
    transform: translateX(6px);
    box-shadow: 0 4px 14px rgba(255, 140, 0, 0.35);
   }
     .sidebar-item.active .sidebar-icon {
        color: #111;
        transform: scale(1.15);
    }

    /* ===== Scrollbar Styling ===== */
    .sidebar-container::-webkit-scrollbar {
        width: 6px;
    }

    .sidebar-container::-webkit-scrollbar-thumb {
        background: #ff9800;
        border-radius: 10px;
    }

    .sidebar-container::-webkit-scrollbar-track {
        background: #1b1b1b;
    }

    /* ===== Optional Smooth Font ===== */
    * {
        font-family: 'Poppins', sans-serif;
    }
 `}
</style>
<div 
    className="d-flex flex-column flex-shrink-0 p-3 text-white sidebar-container" style={{overflow:"auto"}}
>
    <ul className="list-group list-group-flush">
        {components.map((comp) => (
            <React.Fragment key={comp.name}>
                <li
                    className={`list-group-item bg-transparent border-0 sidebar-item ${
    activeMenu === comp.name ? "active" : ""
}`}
                    onClick={comp.subItems ? handleBinsClick : () => {setActiveComponent(comp.name);setActiveMenu(comp.name);}}>

                    <span className="sidebar-icon">
                        <FontAwesomeIcon icon={comp.icon} />
                    </span>

                    {comp.name}

                    {comp.subItems && (
                        <span className={`dropdown-icon ${isBinsOpen ? 'open' : ''}`}>
                            <FontAwesomeIcon 
                                icon={isBinsOpen ? faChevronDown : faChevronRight} 
                            />
                        </span>
                    )}
                </li>

                {comp.subItems && isBinsOpen && (
                    <div className="sub-items">
                        {comp.subItems.map((subItem) => (
                            <li
                                key={subItem.name}
                                className={`list-group-item bg-transparent border-0 sidebar-item sub-item ${
    activeMenu === subItem.name ? "active" : ""
}`}
                                onClick={() => {setActiveComponent(subItem.name);setActiveMenu(subItem.name);}}>

                                <span className="sidebar-icon">
                                    <FontAwesomeIcon icon={subItem.icon} />
                                </span>

                                {subItem.name}
                            </li>
                        ))}
                    </div>
                )}
            </React.Fragment>
        ))}
    </ul>

    {/* Logout Button */}
    <button className="logout-button" onClick={handleLogout}>
        <FontAwesomeIcon icon={faSignOutAlt} />
        Logout
    </button>
</div>
        </>
    );
};

export default Sidebar;
