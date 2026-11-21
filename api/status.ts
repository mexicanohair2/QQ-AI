import { ensureQuantumReady } from "../src/lib/qq-quantum-server.ts";

export async function GET(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", Allow: "GET" },
    });
  }

  try {
    const model = await ensureQuantumReady();
    return new Response(JSON.stringify({ status: "ok", ...model }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response(JSON.stringify({
      status: "error",
      model: "QQ Quantum Online",
      error: "The bundled QQ Quantum runtime could not be initialized.",
    }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
