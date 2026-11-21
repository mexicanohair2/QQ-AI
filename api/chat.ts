import { readRequestTextLimited, readResponseTextLimited } from "../src/lib/bounded-response.ts";
import {
  buildSearchOnlyAnswer,
  parseDuckDuckGoResults,
  parseBingResults,
  mergeSearchResults,
  shouldSearchWeb,
} from "../src/lib/qq-ai-core.ts";
import { answerWithQuantum } from "../src/lib/qq-quantum-server.ts";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type RequestBody = { messages?: ChatMessage[]; webSearch?: boolean };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

function validMessages(value: unknown): value is ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 40) return false;
  return value.every((item) =>
    item && typeof item === "object" &&
    ["system", "user", "assistant"].includes((item as ChatMessage).role) &&
    typeof (item as ChatMessage).content === "string" &&
    (item as ChatMessage).content.length <= 12_000
  );
}

async function runSearch(query: string, signal: AbortSignal) {
  const encodedQuery = encodeURIComponent(query.slice(0, 300));
  const providers = [
    { url: "https://html.duckduckgo.com/html/?q=" + encodedQuery, parse: parseDuckDuckGoResults },
    { url: "https://www.bing.com/search?q=" + encodedQuery + "&count=10&setlang=ru&cc=NL", parse: parseBingResults },
 ¶»§q«^