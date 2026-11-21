export type QQSearchSource = {
  title: string;
  url: string;
  domain: string;
  retrievedAt: string;
  excerpt: string;
};

const SEARCH_INTENT = /(?:найди|найти|поищи|поиск(?:ать)?|в интернете|источники|ссылки на|актуальн\p{L}*|сегодня|прямо сейчас|последн\p{L}*\s+(?:новост|событ|верс|данн|курс)|текущ\p{L}*\s+(?:цен|курс|верс|погод|событ)|сколько стоит|курс валют|погод\p{L}*|расписани\p{L}*|когда состоится|latest|today|current|recent|news|price|weather|search|find online|sources)/iu;

export function shouldSearchWeb(text: string): boolean {
  return SEARCH_INTENT.test(text.trim());
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => {
      const point = Number.parseInt(code, 16);
      return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    })
    .replace(/&#([0-9]+);/g, (_match, code: string) => {
      const point = Number.parseInt(code, 10);
      return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    });
}

function escapeMarkdownLabel(value: string): stri���q�^