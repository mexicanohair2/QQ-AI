import {
  modelEndpointRequiresApiKey,
  resolveModelApiKey,
  safeModelEndpoint,
} from "../src/lib/model-gateway.ts";

export const config = { runtime: "edge" };
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") return new Response(JSON.stringify({ error: "Метод не поддерживается." }), { status: 405 });

  // Text generation is powered only by the user's own QQ Quantum service.
  // The model package is bundled with the server-side chat function.
  const hasModel = true;

  // Vision remains a separate optional tool; it never replaces the language model.
  const visionEndpoint = safeModelEndpoint(process.env.QQ_AI_VISION_API_URL?.trim());
  const visionModel = process.env.QQ_AI_VISION_MODEL?.trim();
  const visionKey = resolveModelApiKey(
    process.env.QQ_AI_VISION_API_KEY,
    process.env.QQ_AI_API_KEY,
    process.env.DEEPSEEK_API_KEY,
    process.env.OPENAIAPIKEY,
  );
  const hasVision = Boolean(visionEndpoint && visionModel &&
    (!modelEndpointRequiresApiKey(visionEndpoint) || visionKey));
  const body = {
    onlineText: {
      state: hasModel ? "configured" : "unconfigured",
      model: hasModel ? "QQ Quantum Online" : null,
      provider: "self-hosted QQ Quantum",
      note: hasModel
        ? "Собственная QQ Quantum работает на сервере; веса не скачиваются на устройство. Свободная генерация пока эк���q�^