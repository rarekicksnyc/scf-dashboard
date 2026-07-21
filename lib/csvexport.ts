// Shared CSV builder used by every export/report endpoint.
function field(v: string | number): string {
  const s = String(v ?? "");
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
