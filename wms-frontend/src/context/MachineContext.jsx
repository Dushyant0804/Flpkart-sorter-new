import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const MachineContext = createContext(null);

const API_BASE = "http://localhost:5001";

export function MachineProvider({ children }) {
  const [machines, setMachines] = useState([]);
  const [selectedMachine, setSelectedMachineState] = useState(
    localStorage.getItem("selectedMachine") || ""
  );
  const [selectedInstallationId, setSelectedInstallationId] = useState(
    localStorage.getItem("selectedInstallationId") || ""
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMachines = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/settings/machineList`);
        const list = Array.isArray(res.data) ? res.data : [];
        setMachines(list);

        const storedMachine = localStorage.getItem("selectedMachine");

        // Priority 1: Default to "m01" if present
        // Priority 2: Stored machine if it still exists in the fetched list
        // Priority 3: First available machine object
        const defaultMatch =
          list.find((m) => m?.machine_id?.toLowerCase() === "m01") ||
          list.find((m) => m?.machine_id === storedMachine) ||
          list[0];

        if (defaultMatch) {
          setSelectedMachineState(defaultMatch.machine_id);
          setSelectedInstallationId(defaultMatch.installation_id || "");

          localStorage.setItem("selectedMachine", defaultMatch.machine_id);
          if (defaultMatch.installation_id) {
            localStorage.setItem(
              "selectedInstallationId",
              defaultMatch.installation_id
            );
          }
        }
      } catch (err) {
        console.error("❌ Failed to fetch machine list:", err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMachines();
  }, []);

  const setSelectedMachine = (machine_id) => {
    // Find corresponding installation_id when machine_id changes
    const matched = machines.find((m) => m.machine_id === machine_id);
    const installation_id = matched?.installation_id || "";

    setSelectedMachineState(machine_id);
    setSelectedInstallationId(installation_id);

    localStorage.setItem("selectedMachine", machine_id);
    localStorage.setItem("selectedInstallationId", installation_id);
  };

  return (
    <MachineContext.Provider
      value={{
        machines,
        selectedMachine,
        selectedInstallationId,
        setSelectedMachine,
        loading,
        error,
      }}
    >
      {children}
    </MachineContext.Provider>
  );
}

export function useMachine() {
  const ctx = useContext(MachineContext);
  if (!ctx) {
    throw new Error("useMachine must be used within a <MachineProvider>");
  }
  return ctx;
}