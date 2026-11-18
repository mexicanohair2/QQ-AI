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

export const CHAT_STORAGE_KEY = "qq-ai-chat-v2";
export const THREAD_STORAGE_KEY = "qq-ai-thread-v1";

type ChatStorage = Pick<Storage, "getItem" | "setItem">;

function scopedKey(base: string, scopeId: string): string {
  const scope = scopeId.trim().slice(0, 128);
  if (!scope || scope === "anonymous") return base;
  return base + ":" + scope.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getStorage(storage?: ChatStorage | null): ChatStorage | undefined {
  try {
    return storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  } catch {
    return undefined;
  }
}

export function readChatMessages(storage?: ChatStorage | null, scopeId = "anonymous"): ChatMessage[] {
  try {
    const source = getStorage(storage);
    if (!source) return [];
    const raw = source.getItem(scopedKey(CHAT_STORAGE_KEY, scopeId));
    return sanitizeChatMessages(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export function persistChatMessages(value: unknown, storage?: ChatStorage | null, scopeId = "anonymous"): boolean {
  try {
    const target = getStorage(storage);
    if (!target) return false;
    target.setItem(scopedKey(CHAT_STORAGE_KEY, scopeId), JSON.stringify(sanitizeChatMessages(value)));
    return true;
  } catch {
    return false;
  }
}

export function readChatThreadId(storage?: ChatStorage | null, scopeId = "anonymous"): string | null {
  try {
    const source = getStorage(storage);
    const value = source?.getItem(scopedKey(THREAD_STORAGE_KEY, scopeId));
    return typeof value === "string" && value.length > 0 && value.length <= 128 &&
      /^[a-zA-Z0-9_-]+$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function persistChatThreadId(value: string, storage?: ChatStorage | null, scopeId = "anonymous"): boolean {
  try {
    const target = getStorage(storage);
    if (!target || !value || value.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(value)) return false;
    target.setItem(scopedKey(THREAD_STORAGE_KEY, scopeId), value);
    return true;
  } catch {
    return false;
  }
}
