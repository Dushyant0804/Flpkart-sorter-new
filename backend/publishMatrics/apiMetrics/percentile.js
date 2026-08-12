function percentile(values, p) {

  if (!values.length)
    return 0;

  const sorted = [...values].sort((a, b) => a - b);

  const index =
    Math.ceil((p / 100) * sorted.length) - 1;

  return sorted[Math.max(index, 0)];

}

module.exports = percentile;