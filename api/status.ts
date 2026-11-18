export const config = { runtime: "edge" };

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
});

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Метод не поддерживается." }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const modelConfigured = Boolean(process.env.QQ_AI_MODEL_URL?.trim() && process.env.QQ_AI_MODEL_NAME?.trim());
  const visionConfigured = modelConfigured && process.env.QQ_AI_MODEL_SUPPORTS_VISION === "true";
  const videoConfigured = visionConfigured && process.env.QQ_AI_MODEL_SUPPORTS_VIDEO_FRAMES === "true";

  return json({
    product: "QQ AI",
    mode: "online",
    model: {
      configured: modelConfigured,
      name: modelConfigured ? process.env.QQ_AI_MODEL_NAME?.trim() : null,
      hosting: "self-hosted-qq-inference",
    },
    capabilities: {
      text: modelConfigured,
      reasoning: modelConfigured,
      webSearch: true,
      imageUnderstanding: visionConfigured,
      videoFrames: videoConfigured,
      audioTranscription: false,
      knowledgeRetrieval: false,
    },
    offline: {
      model: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
      separate: true,
    },
  });
}
