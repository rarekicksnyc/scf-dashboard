import * as XLSX from "xlsx";

// Shared helper to emit a nicely formatted .xlsx workbook as an HTTP response.
// One sheet, a bold-ish header row (via a frozen top row + auto column widths),
// and optional trailing total rows. Values are written as native types so
// numbers stay numeric (right-aligned, sortable) in Excel rather than text.

export type Cell = string | number | null;

export interface XlsxColumn {
  header: string;
  width?: number; // character width; auto-sized from content when omitted
}

export function xlsxResponse(
  filename: string,
  sheetName: string,
  columns: XlsxColumn[],
  rows: Cell[][],
): Response {
  const aoa: Cell[][] = [columns.map((c) => c.header), ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths: explicit, else the widest cell in the column (capped).
  ws["!cols"] = columns.map((c, i) => {
    if (c.width) return { wch: c.width };
    let max = c.header.length;
    for (const row of rows) {
      const v = row[i];
      if (v == null) continue;
      const len = String(v).length;
      if (len > max) max = len;
    }
    return { wch: Math.min(Math.max(max + 2, 8), 48) };
  });

  // Freeze the header row so it stays visible while scrolling.
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
