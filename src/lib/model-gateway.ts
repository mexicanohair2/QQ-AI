export type ModelGatewayMessage = { role: string; content: unknown };

export type ChatCompletionPayloadOptions = {
  endpoint: string;
  model: string;
  messages: ModelGatewayMessage[];
  stream: boolean;
  maxOutputTokens: number;
  temperature?: number;
};

/** Accepts only public HTTPS model endpoints; credentials must never be embedded in the URL. */
export function safeModelEndpoint(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isOpenAIEndpoint(raw: string | undefined | null): boolean {
  if (!raw) return false;
  try {
    return new URL(raw).hostname.toLowerCase() === "api.openai.com";
  } catch {
    return false;
  }
}

export function modelEndpointRequiresApiKey(raw: string | undefined | null): boolean {
  return isOpenAIEndpoint(raw);
}

/** Prefer the project-neutral key; retain OPENAIAPIKEY as a backwards-compatible Vercel alias. */
export function resolveModelApiKey(...values: Array<string | undefined | null>): string | undefined {
  return values.map(value => value?.trim()).find(Boolean);
}

/** Builds the correct Chat Completions payload for OpenAI and other compatible gateways. */
export function buildChatCompletionPayload(options: ChatCompletionPayloadOptions): Record<string, unknown> {
  const { endpoint, model, messages, stream, maxOutputTokens, temperature = 0.7 } = options;
  if (!isOpenAIEndpoint(endpoint)) {
    return {
      model,
      messages,
      temperature,
      max_tokens: maxOutputTokens,
      stream,
    };
  }

  const isReasoningModel = /^gpt-(?:5\.[2-6]|6(?:\.\d+)?)(?:-|$)/i.test(model);
  return {
    model,
    messages,
    max_completion_tokens: maxOutputTokens,
    stream,
    ...(isReasoningModel ? { reasoning_effort: "low" } : { temperature }),
  };
}
