// Shared CSV builder used by every export/report endpoint.
// Neutralizes spreadsheet formula injection: a cell that a bank-ops user opens in
// Excel/Sheets is parsed as a formula if it starts with = + - @ (or a tab/CR),
// regardless of CSV quoting (quotes are stripped on import). Prefix such cells
// with an apostrophe so the content is always treated as literal text.
export function csvSafe(v: string | number): string {
  const s = String(v ?? "");
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function field(v: string | number): string {
  const s = csvSafe(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number>>,
): string {
  const lines = [headers.map(field).join(",")];
  for (const r of rows) lines.push(r.map(field).join(","));
  return lines.join("\n");
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
