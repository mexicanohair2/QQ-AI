export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: Array<{ name: string; kind: "image" | "video" }>;
};

const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 120_000;

export function sanitizeChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
    )
    .filter(item =>
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string" &&
      item.content.length <= MAX_MESSAGE_LENGTH
    )
    .map(item => {
      const attachments = Array.isArray(item.attachments)
        ? item.attachments
            .filter((attachment): attachment is Record<string, unknown> =>
              Boolean(attachment) && typeof attachment === "object" && !Array.isArray(attachment)
            )
            .filter(attachment =>
              typeof attachment.name === "string" &&
              attachment.name.length > 0 &&
              attachment.name.length <= 255 &&
              (attachment.kind === "image" || attachment.kind === "video")
            )
            .map(attachment => ({
              name: attachment.name as string,
              kind: attachment.kind as "image" | "video",
            }))
        : [];

      return {
        role: item.role as "user" | "assistant",
        content: item.content as string,
        ...(attachments.length ? { attachments } : {}),
      };
    })
    .slice(-MAX_MESSAGES);
}

export function readChatMessages(storage?: Pick<Storage, "getItem">): ChatMessage[] {
  try {
    const source = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!source) return [];
    const raw = source.getItem("qq-ai-chat-v2");
    return sanitizeChatMessages(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}
