// src/app/api/events/route.ts
// SSE endpoint — frontend subscribes here for real-time updates
// Session-aware: each user only receives their own events
import { NextRequest } from "next/server";
import { addClient, removeClient } from "@/lib/pipeline-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session") || "__default__";
  const clientId = crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: {"clientId":"${clientId}"}\n\n`)
      );

      // Register this client for session-scoped broadcasts
      addClient(sessionId, clientId, controller);
    },
    cancel() {
      removeClient(sessionId, clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
