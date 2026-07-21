import { NextResponse } from "next/server";
import { getBatch } from "@/lib/data/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const batch = getBatch(batchId);
  if (!batch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(batch);
}
