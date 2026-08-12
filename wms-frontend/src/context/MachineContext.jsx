import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const MachineContext = createContext(null);

// Base URL kept consistent with the rest of the app's hardcoded API host.
const API_BASE = "http://localhost:5001";

export function MachineProvider({ children }) {
  const [machines, setMachines] = useState([]);
  const [selectedMachine, setSelectedMachineState] = useState(
    localStorage.getItem("selectedMachine") || null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMachines = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/settings/machineList`);
        const list = res.data || [];
        setMachines(list);

        // Default: "m01" if present, else previously-selected machine if
        // it's still valid, else the first machine in the list.
        const stored = localStorage.getItem("selectedMachine");
        const defaultMachine =
          list.find((m) => m.toLowerCase() === "m01") ||
          (stored && list.includes(stored) ? stored : list[0]);

        if (defaultMachine) {
          setSelectedMachineState(defaultMachine);
          localStorage.setItem("selectedMachine", defaultMachine);
        }
      } catch (err) {
        console.log(err)
        console.error("❌ Failed to fetch machine list:", err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchMachines();
  }, []);

  const setSelectedMachine = (machine_id) => {
    setSelectedMachineState(machine_id);
    localStorage.setItem("selectedMachine", machine_id);
  };

  return (
    <MachineContext.Provider
      value={{ machines, selectedMachine, setSelectedMachine, loading, error }}
    >
      {children}
    </MachineContext.Provider>
  );
}

// Any page/component just does: const { selectedMachine } = useMachine();
// and includes it as a `machine_id` param in its own API calls.
export function useMachine() {
  const ctx = useContext(MachineContext);
  if (!ctx) {
    throw new Error("useMachine must be used within a <MachineProvider>");
  }
  return ctx;
}
