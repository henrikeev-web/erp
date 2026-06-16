export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { sseEmitter } from "@/lib/sse";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let listener: ((msg: string) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      listener = (msg: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
        } catch {
          // controller already closed
        }
      };
      sseEmitter.on("admin", listener);
      // Initial ping to confirm connection
      controller.enqueue(encoder.encode(": connected\n\n"));

      // Keep-alive ping every 25s
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(ping);
        }
      }, 25000);

      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        if (listener) sseEmitter.off("admin", listener);
      });
    },
    cancel() {
      if (listener) sseEmitter.off("admin", listener);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
