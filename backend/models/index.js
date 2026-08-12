const { initChuteMappingsTable } = require("./Chutemappings");
const { initChuteThresholdsTable } = require("./Chutethresholds");
const { initLabelConfigurationsTable } = require("./Labelconfigurations");
const { initBulkDataTable } = require("./BulkDataTable");
const { initPreviousBulkDataTable } = require("./PreviousBulkDataTable");
const { initAuthTable } = require("./AuthTable");
const { initParcelsTable } = require("./Parcels");
const { initSortedBulkDataTable } = require("./Sortedbulkdata");
const { initBagsWbnTable } = require("./Bagswbn");
const { initBagSensorsTable } = require("./Bagsensors");
const { initBagClosingTable } = require("./Bagclosing");
const { initPrimaryBinDataTable } = require("./PrimaryBinData");
const { initUsersTable } = require("./UsersTable");                     // 👈 NEW
const { initUserLogsTable } = require("./UserLogsTable");               // 👈 NEW
const { initRemoveShipmentTable } = require("./RemoveShipmentTable");   // 👈 NEW
const { initSorterAuditLogTable } = require("./SorterAuditLog");        // 👈 NEW
// const { initSettingsTable } = require("./Settings");

async function initAllTables(pool) {
  await Promise.all([
    initChuteMappingsTable(pool),
    initChuteThresholdsTable(pool),
    initLabelConfigurationsTable(pool),
    initBulkDataTable(pool),
    initPreviousBulkDataTable(pool),
    initAuthTable(pool),
    initParcelsTable(pool),
    initSortedBulkDataTable(pool),
    initBagsWbnTable(pool),
    initBagSensorsTable(pool),
    initBagClosingTable(pool),
    initPrimaryBinDataTable(pool),
    initUsersTable(pool),
    initUserLogsTable(pool),
    initRemoveShipmentTable(pool),
    initSorterAuditLogTable(pool),
  ]);
  console.log("All tables ready");
}

module.exports = { initAllTables };