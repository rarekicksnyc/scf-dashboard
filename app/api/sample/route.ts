import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

// Serves the on-disk sample batch so the UI's "Load sample" button and the
// data/ file stay a single source.
export async function GET() {
  const path = join(process.cwd(), "data", "sample_batch.csv");
  const csv = await readFile(path, "utf8");
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv" },
  });
}
