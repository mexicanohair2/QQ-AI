import type { ChatMessage, Conversation } from "../../types/chat";

export const CHAT_DB_NAME = "qq-ai";
export const CHAT_DB_VERSION = 1;
export const CHAT_STORE_NAME = "conversations";

type StoredConversation = Conversation & { schemaVersion: number };

export function openChatDatabase(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(CHAT_DB_NAME, CHAT_DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHAT_STORE_NAME)) {
        db.createObjectStore(CHAT_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open chat database"));
    request.onblocked = () => reject(new Error("Chat database upgrade is blocked"));
  });
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string"
    && (item.role === "user" || item.role === "assistant")
    && typeof item.content === "string"
    && typeof item.createdAt === "number"
    && Number.isFinite(item.createdAt)
    && (item.status === "complete" || item.status === "pending" || item.status === "error");
}

function isConversation(value: unknown): value is StoredConversation {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.schemaVersion === CHAT_DB_VERSION
    && typeof item.id === "string"
    && typeof item.title === "string"
    && Array.isArray(item.messages)
    && item.messages.every(isMessage)
    && typeof item.createdAt === "number"
    && Number.isFinite(item.createdAt)
    && typeof item.updatedAt === "number"
    && Number.isFinite(item.updatedAt);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export async function loadConversations(db?: IDBDatabase): Promise<Conversation[]> {
  let database = db;
  const ownsDatabase = !database;
  try {
    database ??= await openChatDatabase();
    const transaction = database.transaction(CHAT_STORE_NAME, "readonly");
    const completion = transactionComplete(transaction);
    const records = await requestResult<unknown[]>(transaction.objectStore(CHAT_STORE_NAME).getAll());
    await completion;
    return records.filter(isConversation).map(({ schemaVersion: _schemaVersion, ...conversation }) => conversation);
  } catch {
    return [];
  } finally {
    if (ownsDatabase) database?.close();
  }
}

export async function saveConversations(conversations: Conversation[], db?: IDBDatabase): Promise<void> {
  let database = db;
  const ownsDatabase = !database;
  try {
    database ??= await openChatDatabase();
    const transaction = database.transaction(CHAT_STORE_NAME, "readwrite");
    const completion = transactionComplete(transaction);
    const store = transaction.objectStore(CHAT_STORE_NAME);
    store.clear();
    for (const conversation of conversations) {
      store.put({ ...conversation, schemaVersion: CHAT_DB_VERSION } satisfies StoredConversation);
    }
    await completion;
  } catch {
    // Persistence is best-effort: chat stays usable if browser storage is unavailable.
  } finally {
    if (ownsDatabase) database?.close();
  }
}
