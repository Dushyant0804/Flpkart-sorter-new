const fs = require("fs");

const INPUT_FILE = "itemids.txt";
const OUTPUT_FILE = "insert.sql";

// Second label (change this if needed)
const SECOND_LABEL = "E-588297860";

// Common sort_code
const SORT_CODE = [
  { key: "qos", value: "R" },
  { key: "size", value: "S" },
  { key: "productcategory", value: "03" },
  { key: "coc", value: "IXA/BLN" },
  { key: "vendor", value: "E" },
  { key: "merchant", value: "O" },
  { key: "goodstype", value: "D" },
  { key: "flow", value: "F" }
];

const TYPE = "SHIPMENT";

const itemIds = fs
  .readFileSync(INPUT_FILE, "utf8")
  .split(/\r?\n/)
  .map(x => x.trim())
  .filter(Boolean);

const values = [];

let timestamp = Date.now();

for (const itemId of itemIds) {

  const labels = JSON.stringify([
    itemId,
    SECOND_LABEL
  ]);

  const sortCode = JSON.stringify(SORT_CODE);

  values.push(`(
'${itemId}',
'${labels}'::jsonb,
'${TYPE}',
'${sortCode}'::jsonb,
${timestamp++},
NOW()
)`);
}

const sql = `INSERT INTO bulk_data (
item_id,
labels,
type,
sort_code,
timestamp,
received_at
)
VALUES

${values.join(",\n")};
`;

fs.writeFileSync(OUTPUT_FILE, sql);

console.log(`Generated ${itemIds.length} rows.`);
console.log(`Output saved to ${OUTPUT_FILE}`);