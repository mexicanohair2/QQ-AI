import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadConversations, openChatDatabase, saveConversations } from "./storage";
import type { Conversation } from "../../types/chat";

const conversation: Conversation = {
  id: "c1",
  title: "Привет",
  messages: [{
    id: "m1", role: "user", content: "Привет", createdAt: 10, status: "complete",
  }],
  createdAt: 10,
  updatedAt: 10,
};

describe("chat storage", () => {
  it("round-trips conversations through IndexedDB", async () => {
    const db = await openChatDatabase(new IDBFactory());
    await saveConversations([conversation], db);
    await expect(loadConversations(db)).resolves.toEqual([conversation]);
    db.close();
  });

  it("ignores records with an unsupported schema version or malformed fields", async () => {
    const db = await openChatDatabase(new IDBFactory());
    const tx = db.transaction("conversations", "readwrite");
    tx.objectStore("conversations").put({ ...conversation, schemaVersion: 99 });
    tx.objectStore("conversations").put({ id: "broken", schemaVersion: 1, messages: "not-an-array" });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await expect(loadConversations(db)).resolves.toEqual([]);
    db.close();
  });

  it("recovers safely when the database is closed", async () => {
    const db = await openChatDatabase(new IDBFactory());
    db.close();
    await expect(loadConversations(db)).resolves.toEqual([]);
    await expect(saveConversations([conversation], db)).resolves.toBeUndefined();
  });
});
