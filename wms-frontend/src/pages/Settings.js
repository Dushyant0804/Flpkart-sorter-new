
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { TabView, TabPanel } from "primereact/tabview";
import { InputText } from "primereact/inputtext";
import { InputNumber } from "primereact/inputnumber";
import { InputSwitch } from "primereact/inputswitch";
import { Button } from "primereact/button";
import { Toast } from "primereact/toast";
import { Card } from "primereact/card";
import { Divider } from "primereact/divider";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import RegexEditor from "../pages/RegexEditor";
import "../styles/SettingsPage.css";

import { useMachine } from "../context/MachineContext";


const SettingsPage = () => {

  // ============================================================
  // MULTI MACHINE
  // ============================================================
  const { selectedMachine } = useMachine();


  const [activeIndex, setActiveIndex] = useState(0);
  const toast = useRef(null);
  const [loading, setLoading] = useState(false);
  const [syncState, setSyncState] = useState("synced");
  const [users, setUsers] = useState([]);
  const [subAdmin, setSubAdmin] = useState([]);
  const [userDialog, setUserDialog] = useState(false);
  const [subAdminDialog, setSubAdminDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editSubAdmin, setEditSubAdmin] = useState(null);


  const [userForm, setUserForm] = useState({
    username: "",
    password: "",
    role: "Operator",
  });


  const [subAdminForm, setSubAdminForm] = useState({
    username: "",
    password: "",
    role: "user",
  });


  const roleOptions = [
    {
      label: "Operator",
      value: "Operator"
    }
  ];


  const roleOptionsForUser = [
    {
      label: "User",
      value: "user"
    }
  ];


  const [settings, setSettings] = useState({
    sorter_name: "",
    state: "",
    center_name: "",
    data_incoming: false,
    live_fetching: false,
    source: "",
    source_id: "",
    source_type: "",
    secondary_api_token: "",
    primary_api_token: "",
    weight_api_token: "",
    bag_seal_api_token: "",
    bagseal_bi: "",
    bagseal_bt: "",
    primary_api: false,
    secondary_api: false,
    bagseal_api: false,
    gi_api: false,
    weight_api: false,
    calibration_api: false,
    calibration_wbn: "",
    calibration_length: null,
    calibration_width: null,
    calibration_height: null,
    calibration_weight: null,
    calibration_real_volume: null,
    calibration_length_tolerance: null,
    calibration_width_tolerance: null,
    calibration_height_tolerance: null,
    calibration_weight_tolerance: null,
    calibration_real_volume_tolerance: null,
    calibration_threshold: null,
    box_length_min: null,
    box_length_max: null,
    box_width_min: null,
    box_width_max: null,
    box_height_min: null,
    box_height_max: null,
    box_weight_min: null,
    box_weight_max: null,
    cuttoff_volume: null
  });


  const [originalSettings, setOriginalSettings] = useState({});


  // ============================================================
  // FETCH SETTINGS WHEN MACHINE CHANGES
  // ============================================================
  useEffect(() => {

    if (!selectedMachine) {
      return;
    }

    fetchSettings();

  }, [selectedMachine]);


  // ============================================================
  // GET SETTINGS FOR SELECTED MACHINE
  // ============================================================
  const fetchSettings = async () => {

    if (!selectedMachine) {
      console.log("❌ No machine selected");
      return;
    }

    console.log(
      "🔵 Fetching settings for machine:",
      selectedMachine
    );

    try {

      const res = await axios.get(
        "http://localhost:5001/api/settings/settings-get",
        {
          params: {
            machine_id: selectedMachine
          }
        }
      );

      console.log(
        "✅ Settings received for:",
        selectedMachine,
        res.data
      );

      setSettings(res.data);
      setOriginalSettings(res.data);
      setSyncState("synced");

    } catch (err) {

      console.error("❌ Settings fetch failed:", err);

      console.error(
        "Status:",
        err.response?.status
      );

      console.error(
        "Response:",
        err.response?.data
      );

      toast.current.show({
        severity: "error",
        summary: "Fetch Failed",
        detail:
          err.response?.data?.error ||
          "Unable to load settings from server.",
        life: 3000,
      });
    }
  };


  // ============================================================
  // HANDLE SETTING CHANGE
  // ============================================================
  const handleChange = (key, value) => {

    setSettings((prev) => {

      const updated = {
        ...prev,
        [key]: value
      };

      const changed =
        JSON.stringify(updated) !==
        JSON.stringify(originalSettings);

      setSyncState(
        changed
          ? "unsaved"
          : "synced"
      );

      return updated;
    });
  };


  // ============================================================
  // SAVE SETTINGS FOR SELECTED MACHINE
  // ============================================================
  const handleSave = async () => {

    if (!selectedMachine) {

      toast.current.show({
        severity: "warn",
        summary: "Machine Not Selected",
        detail: "Please select a machine first.",
        life: 2500,
      });

      return;
    }

    setLoading(true);
    setSyncState("saving");

    try {

      await axios.put(
        "http://localhost:5001/api/settings/settings-update",
        {
          ...settings,
          machine_id: selectedMachine
        }
      );

      setOriginalSettings({
        ...settings,
        machine_id: selectedMachine
      });

      setSyncState("synced");

      toast.current.show({
        severity: "success",
        summary: "Saved",
        detail:
          `Settings updated successfully for ${selectedMachine}!`,
        life: 2500,
      });

    } catch (err) {

      console.error(
        "❌ Settings save failed:",
        err
      );

      setSyncState("unsaved");

      toast.current.show({
        severity: "error",
        summary: "Save Failed",
        detail:
          err.response?.data?.error ||
          "Failed to update settings.",
        life: 2500,
      });

    } finally {

      setLoading(false);
    }
  };


  // ============================================================
  // PUSH SETTINGS TO NODE-RED
  // ============================================================
  const handlePush = async () => {

    if (!selectedMachine) {

      toast.current.show({
        severity: "warn",
        summary: "Machine Not Selected",
        detail: "Please select a machine first.",
        life: 2500,
      });

      return;
    }

    setLoading(true);

    try {

      await axios.post(
        "http://localhost:5001/api/settings/settings-push-nodered",
        {
          params: {
            machine_id: selectedMachine
          }
        }
      );

      toast.current.show({
        severity: "success",
        summary: "Pushed",
        detail:
          `Settings pushed to ${selectedMachine} (Node-RED) successfully!`,
        life: 2500,
      });

    } catch (err) {

      console.error(
        "❌ Settings push failed:",
        err
      );

      toast.current.show({
        severity: "error",
        summary: "Push Failed",
        detail:
          err.response?.data?.error ||
          "Failed to push settings to sorter.",
        life: 3000,
      });

    } finally {

      setLoading(false);
    }
  };


  const fetchUsers = async () => {

    try {

      const res = await axios.get(
        "http://localhost:5001/api/operators"
      );

      const list =
        Array.isArray(res.data)
          ? res.data
          : [];

      setUsers(list);

    } catch (err) {

      console.error(err);
      setUsers([]);
    }
  };


  const fetchSubAdmin = async () => {

    try {

      const res = await axios.get(
        "http://localhost:5001/api/users/getSubAdmin"
      );

      const list =
        Array.isArray(res.data)
          ? res.data
          : [];

      setSubAdmin(list);

    } catch (err) {

      console.error(err);
      setSubAdmin([]);
    }
  };


  const openAddUser = () => {

    setEditingUser(null);

    setSubAdminForm({
      username: "",
      password: "",
      role: "Operator"
    });

    setUserDialog(true);
  };


  const openEditUser = (row) => {

    console.log(
      "row is ",
      row
    );

    setEditingUser(row);

    setUserForm({
      username: row.username,
      password: "",
      role: row.role
    });

    setUserDialog(true);
  };


  const openEditSubAdmin = (row) => {

    setEditSubAdmin(row);

    setSubAdminForm({
      username: row.username,
      password: "*****",
      role: row.role
    });

    setSubAdminDialog(true);
  };


  const openAddSubAdmin = () => {

    setEditSubAdmin(null);

    setUserForm({
      username: "",
      password: "",
      role: "Operator"
    });

    setSubAdminDialog(true);
  };


  const saveSubAdmin = async () => {

    try {

      if (editSubAdmin) {

        await axios.put(
          `http://localhost:5001/api/users/updateSubAdmin/${editSubAdmin.id}`,
          subAdminForm
        );

      } else {

        await axios.post(
          "http://localhost:5001/api/users/newUser",
          subAdminForm
        );
      }

      setSubAdminForm({
        username: "",
        password: ""
      });

      setSubAdminDialog(false);

      fetchSubAdmin();

      toast.current.show({
        severity: "success",
        summary: "Success",
        detail:
          editSubAdmin
            ? "Sub Admin updated"
            : "Sub Admin created",
        life: 2500,
      });

    } catch (err) {

      console.error(err);

      toast.current.show({
        severity: "error",
        summary: "Failed",
        detail: "Operation failed",
        life: 3000,
      });
    }
  };


  const saveUser = async () => {

    try {

      if (editingUser) {

        await axios.put(
          `http://localhost:5001/api/operators/${editingUser.id}`,
          userForm
        );

      } else {

        await axios.post(
          "http://localhost:5001/api/operators",
          userForm
        );
      }

      setUserForm({
        username: ""
      });

      setUserDialog(false);

      fetchUsers();

      toast.current.show({
        severity: "success",
        summary: "Success",
        detail:
          editingUser
            ? "User updated"
            : "User created",
        life: 2500,
      });

    } catch (err) {

      console.error(err);

      toast.current.show({
        severity: "error",
        summary: "Failed",
        detail: "Operation failed",
        life: 3000,
      });
    }
  };


  const deleteUser = async (row) => {

    try {

      await axios.delete(
        `http://localhost:5001/api/operators/${row.id}`
      );

      fetchUsers();

    } catch (err) {

      console.error(err);
    }
  };


  const deleteSubAdmin = async (row) => {

    try {

      await axios.delete(
        `http://localhost:5001/api/users/deleteSubAdmin/${row.id}`
      );

      fetchSubAdmin();

    } catch (err) {

      console.error(err);
    }
  };


  const getSyncBadge = () => {

    if (syncState === "synced")
      return (
        <span className="sync-badge synced">
          <i className="pi pi-check-circle"></i>
          Synced
        </span>
      );

    if (syncState === "unsaved")
      return (
        <span className="sync-badge unsaved">
          <i className="pi pi-exclamation-triangle"></i>
          Unsaved Changes
        </span>
      );

    if (syncState === "saving")
      return (
        <span className="sync-badge saving">
          <i className="pi pi-spin pi-spinner"></i>
          Saving...
        </span>
      );
  };


  return (

    <div className="settings-container">

      <Toast ref={toast} />


      <div className="settings-header">

        <div className="settings-heading">

          <h2>
            <i className="pi pi-cog header-icon"></i>
            System Settings
          </h2>

          <p>
            Configure sorter machine parameters and API integrations below.
          </p>

        </div>


        <div className="header-actions">

          {getSyncBadge()}

          <Button
            label="Save Changes"
            icon="pi pi-check-circle"
            className="save-btn-modern"
            onClick={handleSave}
            loading={loading}
          />

        </div>


        <div className="header-actions">

          <Button
            label="Push to Sorter"
            icon="pi pi-arrow-right"
            className="push-btn-modern"
            onClick={handlePush}
            loading={loading}
          />

        </div>

      </div>


      <Card className="settings-card">

        <TabView
          activeIndex={activeIndex}
          onTabChange={(e) => {

            setActiveIndex(e.index);

            if (e.index === 2) {
              fetchUsers();
              fetchSubAdmin();
            }

          }}
          className="settings-tabs-modern"
        >


          {/* SORTER TAB */}
          <TabPanel
            header={
              <>
                <i className="pi pi-box pe-1"></i>
                Sorter
              </>
            }
          >

            <Divider align="left">

              <span className="section-title">
                <i className="pi pi-cog"></i>
                Sorter Configuration
              </span>

            </Divider>


            <div className="form-grid">

              <div className="form-group">

                <label>
                  <i className="pi pi-tag label-icon"></i>
                  Sorter Name
                </label>

                <InputText
                  value={settings.sorter_name || ""}
                  className="modern-input"
                  onChange={(e) =>
                    handleChange(
                      "sorter_name",
                      e.target.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  <i className="pi pi-map-marker label-icon"></i>
                  State
                </label>

                <InputText
                  value={settings.state || ""}
                  className="modern-input"
                  onChange={(e) =>
                    handleChange(
                      "state",
                      e.target.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  <i className="pi pi-building label-icon"></i>
                  Center Name
                </label>

                <InputText
                  value={settings.center_name || ""}
                  className="modern-input"
                  onChange={(e) =>
                    handleChange(
                      "center_name",
                      e.target.value
                    )
                  }
                />

              </div>


              <div className="form-group switch-group">

                <label>
                  <i className="pi pi-bolt label-icon"></i>
                  Data Incoming
                </label>

                <InputSwitch
                  checked={settings.data_incoming}
                  onChange={(e) =>
                    handleChange(
                      "data_incoming",
                      e.value
                    )
                  }
                />

              </div>


              <div className="form-group switch-group">

                <label>
                  <i className="pi pi-bolt label-icon"></i>
                  Live fetching
                </label>

                <InputSwitch
                  checked={settings.live_fetching}
                  onChange={(e) =>
                    handleChange(
                      "live_fetching",
                      e.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  <i className="pi pi-database label-icon"></i>
                  Cut off Volume
                </label>

                <InputText
                  value={settings.cuttoff_volume || null}
                  className="modern-input"
                  onValueChange={(e) =>
                    handleChange(
                      "cuttoff_volume",
                      e.value
                    )
                  }
                />

              </div>

            </div>

          </TabPanel>


          {/* API TAB */}
          <TabPanel
            header={
              <>
                <i className="pi pi-server pe-1"></i>
                APIs
              </>
            }
          >

            <Divider align="left">

              <span className="section-title">
                <i className="pi pi-link"></i>
                API Configuration
              </span>

            </Divider>


            <div className="form-grid">

              <div className="form-group">

                <label>
                  <i className="pi pi-database label-icon"></i>
                  Client ID
                </label>

                <InputText
                  value={settings.client_id || ""}
                  className="modern-input"
                  onChange={(e) =>
                    handleChange(
                      "source",
                      e.target.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  <i className="pi pi-database label-icon"></i>
                  Client Secrey Key
                </label>

                <InputText
                  value={settings.client_secret || ""}
                  className="modern-input"
                  onChange={(e) =>
                    handleChange(
                      "source",
                      e.target.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  <i className="pi pi-id-card label-icon"></i>
                  Facility ID
                </label>

                <InputText
                  value={settings.facility_id || ""}
                  className="modern-input"
                  onChange={(e) =>
                    handleChange(
                      "source_id",
                      e.target.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  <i className="pi pi-sliders-h label-icon"></i>
                  Installation ID
                </label>

                <InputText
                  value={settings.installation_id || ""}
                  className="modern-input"
                  onChange={(e) =>
                    handleChange(
                      "source_type",
                      e.target.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  <i className="pi pi-key label-icon"></i>
                  Grant Type
                </label>

                <InputText
                  value={settings.grant_type || ""}
                  className="modern-input"
                  onChange={(e) =>
                    handleChange(
                      "secondary_api_token",
                      e.target.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  <i className="pi pi-key label-icon"></i>
                  Target Client ID
                </label>

                <InputText
                  value={settings.target_client_id || ""}
                  className="modern-input"
                  onChange={(e) =>
                    handleChange(
                      "primary_api_token",
                      e.target.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  <i className="pi pi-key label-icon"></i>
                  Flipkart Client ID
                </label>

                <InputText
                  value={settings.fk_host_url || ""}
                  className="modern-input"
                  onChange={(e) =>
                    handleChange(
                      "weight_api_token",
                      e.target.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  <i className="pi pi-lock label-icon"></i>
                  Auth IP
                </label>

                <InputText
                  value={settings.authn_ip || ""}
                  className="modern-input"
                  onChange={(e) =>
                    handleChange(
                      "bag_seal_api_token",
                      e.target.value
                    )
                  }
                />

              </div>

            </div>

          </TabPanel>


          {/* Operators TAB */}
          {/* <TabPanel
            header={
              <>
                <i className="pi pi-users"></i>
                Operators
              </>
            }
          >

            <div className="users-header">

              <Button
                label="Add"
                icon="pi pi-plus"
                className="p-button-sm p-button-success"
                onClick={openAddUser}
              />

            </div>


            <DataTable
              value={users || []}
              className="p-datatable-sm"
              stripedRows
            >

              <Column
                header="S.No"
                body={(_, opt) =>
                  opt.rowIndex + 1
                }
              />

              <Column
                field="username"
                header="Username"
              />

              <Column
                field="role"
                header="ROLE"
              />

              <Column
                header="Actions"
                body={(row) => (

                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem"
                    }}
                  >

                    <Button
                      icon="pi pi-pencil"
                      className="p-button-sm p-button-info"
                      onClick={() =>
                        openEditUser(row)
                      }
                    />

                    <Button
                      icon="pi pi-trash"
                      className="p-button-sm p-button-danger"
                      onClick={() =>
                        deleteUser(row)
                      }
                    />

                  </div>

                )}
              />

            </DataTable> */}


            {/* ADD / EDIT USER DIALOG */}
            {/* <Dialog
              header={
                editingUser
                  ? "Edit User"
                  : "Add User"
              }
              visible={userDialog}
              style={{
                width: "500px"
              }}
              onHide={() => {

                setUserDialog(false);

                setUserForm({
                  username: ""
                });

              }}
              className="modern-user-dialog"
            >

              <div className="modern-dialog-body">

                <div className="modern-field">

                  <label className="modern-label">

                    <i className="pi pi-user"></i>

                    Username

                  </label>

                  <InputText
                    type="text"
                    className="modern-input"
                    placeholder="Enter username"
                    value={userForm.username}
                    onChange={(e) =>
                      setUserForm({
                        ...userForm,
                        username:
                          e.target.value
                      })
                    }
                  />

                </div>


                <div className="modern-field">

                  <label className="modern-label">

                    <i className="pi pi-lock"></i>

                    Password

                  </label>

                  <InputText
                    className="modern-input"
                    placeholder="Enter password"
                    value={userForm.password}
                    onChange={(e) =>
                      setUserForm({
                        ...userForm,
                        password:
                          e.target.value
                      })
                    }
                  />

                </div>


                <div className="modern-field">

                  <label className="modern-label">

                    <i className="pi pi-briefcase"></i>

                    Role

                  </label>

                  <Dropdown
                    className="modern-dropdown"
                    value={userForm.role}
                    options={roleOptions}
                    onChange={(e) =>
                      setUserForm({
                        ...userForm,
                        role: e.value
                      })
                    }
                  />

                </div>


                <div className="modern-dialog-footer">

                  <Button
                    label="Cancel"
                    icon="pi pi-times"
                    className="cancel-btn"
                    onClick={() => {

                      setUserDialog(false);

                      setUserForm({
                        username: ""
                      });

                    }}
                  />

                  <Button
                    label="Save Changes"
                    icon="pi pi-check"
                    className="submit-btn"
                    onClick={saveUser}
                  />

                </div>

              </div>

            </Dialog>

          </TabPanel> */}


          {/* Sub Admin TAB */}
          <TabPanel
            header={
              <>
                <i className="pi pi-users pe-1"></i>
                Sub Admin
              </>
            }
          >

            <div className="users-header">

              <Button
                icon="pi pi-plus"
                label="Add"
                className="p-button-sm p-button-success"
                onClick={openAddSubAdmin}
              />

            </div>


            <DataTable
              value={subAdmin || []}
              className="p-datatable-sm"
              stripedRows
            >

              <Column
                header="S.No"
                body={(_, opt) =>
                  opt.rowIndex + 1
                }
              />

              <Column
                field="username"
                header="Username"
              />

              <Column
                field="role"
                header="role"
              />

              <Column
                header="Actions"
                style={{display:"flex",justifyContent:"center"}}
                body={(row) => (

                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem"
                    }}
                  >

                    <Button
                      icon="pi pi-pencil"
                      className="p-button-sm p-button-info"
                      onClick={() =>
                        openEditSubAdmin(row)
                      }
                    />

                    <Button
                      icon="pi pi-trash"
                      className="p-button-sm p-button-danger"
                      onClick={() =>
                        deleteSubAdmin(row)
                      }
                    />

                  </div>

                )}
              />

            </DataTable>


            {/* ADD / EDIT SUB ADMIN DIALOG */}
            <Dialog
              header={
                editSubAdmin
                  ? "Edit SubAdmin"
                  : "Add SubAdmin"
              }
              visible={subAdminDialog}
              style={{
                width: "500px",
                borderRadius: "10%",
                color: "orange"
              }}
              onHide={() => {

                setSubAdminDialog(false);

                setSubAdminForm({
                  username: "",
                  password: "",
                  role: "user"
                });

              }}
              className="modern-user-dialog"
            >

              <div className="modern-dialog-body">

                <div className="modern-field">

                  <label className="modern-label">

                    <i className="pi pi-user"></i>

                    Username

                  </label>

                  <span className="p-input-icon-left w-100">

                    <i className="pi pi-user"></i>

                    <InputText
                      className="modern-input"
                      placeholder="Enter username"
                      value={subAdminForm.username}
                      onChange={(e) =>
                        setSubAdminForm({
                          ...subAdminForm,
                          username:
                            e.target.value
                        })
                      }
                    />

                  </span>

                </div>


                <div className="modern-field">

                  <label className="modern-label">

                    <i className="pi pi-lock"></i>

                    Password

                  </label>

                  <span className="p-input-icon-left w-100">

                    <i className="pi pi-lock"></i>

                    <InputText
                      type="text"
                      className="modern-input"
                      placeholder="Enter password"
                      value={subAdminForm.password}
                      onChange={(e) =>
                        setSubAdminForm({
                          ...subAdminForm,
                          password:
                            e.target.value
                        })
                      }
                    />

                  </span>

                </div>


                <div className="modern-field">

                  <label className="modern-label">

                    <i className="pi pi-briefcase"></i>

                    Role

                  </label>

                  <Dropdown
                    className="modern-dropdown"
                    value={subAdminForm.role}
                    options={roleOptionsForUser}
                    placeholder="Select Role"
                    onChange={(e) =>
                      setSubAdminForm({
                        ...subAdminForm,
                        role: e.value
                      })
                    }
                  />

                </div>


                <div className="modern-dialog-footer">

                  <Button
                    label="Cancel"
                    icon="pi pi-times"
                    className="cancel-btn"
                    onClick={() => {

                      setSubAdminDialog(false);

                      setSubAdminForm({
                        username: "",
                        password: "",
                        role: "user"
                      });

                    }}
                  />

                  <Button
                    label="Save Changes"
                    icon="pi pi-check"
                    className="submit-btn"
                    onClick={saveSubAdmin}
                  />

                </div>

              </div>

            </Dialog>

          </TabPanel>


          {/* BOX LIMIT TAB */}
          {/* <TabPanel
            header={
              <>
                <i className="pi pi-users"></i>
                BOX LIMIT SETTING
              </>
            }
          >

            <Divider align="left">

              <span className="section-title">

                <i className="pi pi-link"></i>

                Box Limit Configuration

              </span>

            </Divider>


            <div className="form-grid">

              <div className="form-group">

                <label>
                  Box Length Min
                </label>

                <InputNumber
                  value={
                    settings.box_length_min ?? null
                  }
                  onValueChange={(e) =>
                    handleChange(
                      "box_length_min",
                      e.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  Box Length Max
                </label>

                <InputNumber
                  value={
                    settings.box_length_max ?? null
                  }
                  onValueChange={(e) =>
                    handleChange(
                      "box_length_max",
                      e.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  Box Width Min
                </label>

                <InputNumber
                  value={
                    settings.box_width_min ?? null
                  }
                  onValueChange={(e) =>
                    handleChange(
                      "box_width_min",
                      e.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  Box Width Max
                </label>

                <InputNumber
                  value={
                    settings.box_width_max ?? null
                  }
                  onValueChange={(e) =>
                    handleChange(
                      "box_width_max",
                      e.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  Box Height Min
                </label>

                <InputNumber
                  value={
                    settings.box_height_min ?? null
                  }
                  onValueChange={(e) =>
                    handleChange(
                      "box_height_min",
                      e.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  Box Height Max
                </label>

                <InputNumber
                  value={
                    settings.box_height_max ?? null
                  }
                  onValueChange={(e) =>
                    handleChange(
                      "box_height_max",
                      e.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  Box Weight Min
                </label>

                <InputNumber
                  value={
                    settings.box_weight_min ?? null
                  }
                  onValueChange={(e) =>
                    handleChange(
                      "box_weight_min",
                      e.value
                    )
                  }
                />

              </div>


              <div className="form-group">

                <label>
                  Box Weight Max
                </label>

                <InputNumber
                  value={
                    settings.box_weight_max ?? null
                  }
                  onValueChange={(e) =>
                    handleChange(
                      "box_weight_max",
                      e.value
                    )
                  }
                />

              </div>

            </div>

          </TabPanel> */}


          {/* REGEX TAB */}
          <TabPanel
            header={
              <div className="regex-tab-header">

                <i className="pi pi-code pe-1"></i>

                <span>
                  Regex
                </span>

              </div>
            }
          >

            <div className="regex-page-header">

              <div className="regex-page-title">

                <div className="regex-icon-box">

                  <i className="pi pi-filter"></i>

                </div>

                <div>

                  <h3>
                    Regex Configuration
                  </h3>

                  <p>
                    Configure barcode validation
                    patterns for shipment
                    and bag seal scanning.
                  </p>

                </div>

              </div>


              <div className="regex-status-badge">

                <i className="pi pi-shield"></i>

                Active Validation

              </div>

            </div>


            <div className="regex-grid-modern">

              <div className="regex-card-modern">

                <div className="regex-card-top">

                  <div className="regex-card-title">

                    <i className="pi pi-box"></i>

                    Shipment / GI Barcode Regex

                  </div>

                  <span className="regex-chip">
                    Shipment
                  </span>

                </div>


                <div className="regex-card-body">

                  <RegexEditor
                    title="Shipment / GI Barcode Regex"
                    regexList={
                      settings.barcode_regexes || []
                    }
                    onChange={(list) =>
                      handleChange(
                        "barcode_regexes",
                        list
                      )
                    }
                  />

                </div>

              </div>


              <div className="regex-card-modern">

                <div className="regex-card-top">

                  <div className="regex-card-title">

                    <i className="pi pi-lock"></i>

                    Bag Seal Barcode Regex

                  </div>

                  <span className="regex-chip regex-chip-secondary">
                    BagSeal
                  </span>

                </div>


                <div className="regex-card-body">

                  <RegexEditor
                    title="Bag Seal Barcode Regex"
                    regexList={
                      settings.bagseal_regexes || []
                    }
                    onChange={(list) =>
                      handleChange(
                        "bagseal_regexes",
                        list
                      )
                    }
                  />

                </div>

              </div>

            </div>

          </TabPanel>

        </TabView>

      </Card>

    </div>
  );
};


export default SettingsPage;
