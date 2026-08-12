// models/PrimaryBinData.js

const CREATE_PRIMARY_BIN_DATA_TABLE = `
  CREATE TABLE IF NOT EXISTS primary_bin_data (
    id            BIGSERIAL                    PRIMARY KEY,
    wbn           VARCHAR(255)                 NOT NULL,
    length        VARCHAR(20),
    width         VARCHAR(20),
    height        VARCHAR(20),
    weight        VARCHAR(20),
    volume        VARCHAR(20),
    real_volume   VARCHAR(20),
    created_at    TIMESTAMP                    DEFAULT NOW(),
    imagepath     VARCHAR(255),
    mode          VARCHAR(255),
    expected_bag  VARCHAR(50),
    sort          VARCHAR(20),
    reason        VARCHAR(50),
    final_bag     VARCHAR(50),
    scantime      TIMESTAMP,
    sorttime      TIMESTAMP,
    item_id       VARCHAR(255),
    infeed        VARCHAR(10),
    wbn_key       TEXT,
    machine_id    VARCHAR(10)
  );

  CREATE INDEX IF NOT EXISTS idx_primary_bin_data_created_at ON primary_bin_data (created_at);
  CREATE INDEX IF NOT EXISTS idx_primary_bin_data_final_bag  ON primary_bin_data (final_bag);
  CREATE INDEX IF NOT EXISTS idx_primary_bin_data_machine_id ON primary_bin_data (machine_id);
  CREATE INDEX IF NOT EXISTS idx_primary_bin_data_scantime   ON primary_bin_data (scantime);
  CREATE INDEX IF NOT EXISTS idx_primary_bin_data_sort       ON primary_bin_data (sort);
  CREATE INDEX IF NOT EXISTS idx_primary_bin_data_sorttime   ON primary_bin_data (sorttime);
  CREATE INDEX IF NOT EXISTS idx_primary_bin_data_wbn        ON primary_bin_data (wbn);
`;

async function initPrimaryBinDataTable(pool) {
  try {
    await pool.query(CREATE_PRIMARY_BIN_DATA_TABLE);
  } catch (err) {
    console.error("Failed to init primary_bin_data table:", err.message);
    throw err;
  }
}

module.exports = { initPrimaryBinDataTable };