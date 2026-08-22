import { appendFileSync, mkdirSync } from "fs";
import { NextResponse } from "next/server";

const LOG = "/opt/cursor/logs/debug.log";

export async function POST(req: Request) {
  try {
    mkdirSync("/opt/cursor/logs", { recursive: true });
    const text = await req.text();
    const line = text.endsWith("\n") ? text : `${text}\n`;
    appendFileSync(LOG, line);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
