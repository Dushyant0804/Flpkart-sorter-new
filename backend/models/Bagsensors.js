const MACHINE_IDS = ["m01", "m02", "m03", "m04", "m05"];

// NOTE: this CREATE TABLE only runs if the table doesn't exist yet
// (CREATE TABLE IF NOT EXISTS is a no-op on your current DB, since you've
// already manually altered it). This definition is kept in sync with your
// manual changes so a FRESH install (new environment, new DB) gets the
// correct multi-machine schema from day one — chute_id is no longer unique
// by itself, the pair (chute_id, machine_id) is.
const CREATE_BAG_SENSORS_TABLE = `
  CREATE TABLE IF NOT EXISTS bag_sensors (
    id         SERIAL        PRIMARY KEY,
    chute_id   VARCHAR(20)   NOT NULL,
    machine_id VARCHAR(10)   NOT NULL,
    value      SMALLINT      NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT bag_sensors_chute_machine_unique UNIQUE (chute_id, machine_id)
  );

  CREATE INDEX IF NOT EXISTS idx_bag_sensors_chute_id
    ON bag_sensors (chute_id);

  CREATE INDEX IF NOT EXISTS idx_bag_sensors_machine_id
    ON bag_sensors (machine_id);
`;

/**
 * Inserts default rows for all 100 btns and 100 snrs, for every machine.
 * Uses ON CONFLICT (chute_id, machine_id) DO NOTHING — safe to call on
 * every server start; matches the composite unique constraint above.
 * @param {import('pg').PoolClient} client
 */
async function seedBagSensors(client) {
  const rows = [];
  for (const machine_id of MACHINE_IDS) {
    for (let i = 1; i <= 100; i++) {
      rows.push(`('btn${i}', '${machine_id}', 0)`);
      rows.push(`('snr${i}', '${machine_id}', 0)`);
    }
  }

  await client.query(`
    INSERT INTO bag_sensors (chute_id, machine_id, value)
    VALUES ${rows.join(", ")}
    ON CONFLICT (chute_id, machine_id) DO NOTHING
  `);
}

/**
 * Runs on server start — creates table and seeds default rows.
 * @param {import('pg').Pool} pool
 */
async function initBagSensorsTable(pool) {
  const client = await pool.connect();
  try {
    await client.query(CREATE_BAG_SENSORS_TABLE);
    await seedBagSensors(client);
    // console.log("✅ bag_sensors table ready (1000 rows seeded across 5 machines)");
  } catch (err) {
    console.error("❌ Failed to init bag_sensors table:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { initBagSensorsTable };