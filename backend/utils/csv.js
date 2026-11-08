export function toCsv(rows) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return rows.map((row) => row.map(escape).join(',')).join('\r\n');
}
