// src/app/api/submit-script/route.ts
import { NextRequest, NextResponse } from "next/server";
import { submitScript } from "@/lib/pipeline-store";

export async function POST(req: NextRequest) {
  try {
    const sessionId = req.headers.get("x-session-id") || "__default__";
    const { script } = await req.json();

    if (!script || script.trim().length < 10) {
      return NextResponse.json(
        { error: "Script must be at least 10 characters" },
        { status: 400 }
      );
    }

    submitScript(script.trim(), sessionId);

    return NextResponse.json({
      status: "submitted",
      wordCount: script.trim().split(/\s+/).length,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
