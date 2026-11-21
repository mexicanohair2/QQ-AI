export type QuantumKnowledgeEntry = {
  question: string;
  answer: string;
  terms: Set<string>;
};

const STOP_WORDS = new Set(`
а без бы в во вот все вы где да для до его ее если есть же за и из или им их к как ко когда кто ли мне мы на над не него нее ни но о об от по под при про раз с со так то тоже у уже что чтобы это этот чем такое такой такая такие таких этому этой этих
расскажи объясни скажи покажи назови опиши перечисли приведи представь коротко кратко просто простыми словами пожалуйста можешь можно нужно хочу узнать
`.split(/\s+/).filter(Boolean));

const WORD_RE = /[а-яёa-z0-9]+/gi;
const RU_SUFFIXES = [
  "иями", "ями", "ами", "его", "ого", "ему", "ому", "ыми", "ими",
  "ившись", "ывшись", "ившими", "ывшими",
  "аться", "яться", "иться", "ыться", "овать", "евать", "ивать", "ывать",
  "ии", "ией", "ием", "иях", "ению", "ание", "ение",
  "ая", "яя", "ое", "ее", "ые", "ие", "ый", "ий", "ой", "ей",
  "ую", "юю", "ым", "им", "ых", "их", "ом", "ем", "ам", "ям",
  "ах", "ях", "ов", "ев", "ия", "ья", "а", "я", "ы", "и", "е", "у", "ю",
].sort((a, b) => b.length - a.length);

export function normalizeQuantumQuestion(text: string): string {
  return (text.toLocaleLowerCase("ru-RU").match(WORD_RE) ?? []).join(" ");
}

export function normalizeQuantumWord(word: string): string {
  const value = word.toLocaleLowerCase("ru-RU");
  if (!/^[а-яё]+$/.test(value) || value.length < 5) return value;
  for (const suffix of RU_SUFFIXES) {
    const stemLength = value.length - suffix.length;
    // Adjectival endings such as -ему/-ому must not consume a short noun stem:
    // "систему" is an inflected form of "система", not the stem "сист".
    const needsLongerStem = ["его", "ого", "ему", "ому", "ыми", "ими"].includes(suffix);
    if (value.endsWith(suffix) && stemLength >= (needsLongerStem ? 5 : 3)) {
      return value.slice(0, -suffix.length);
    }
  }
  return value;
}

export function quantumTerms(text: string): string[] {
  return (text.toLocaleLowerCase("ru-RU").match(WORD_RE) ?? [])
    .filter(word => word.length > 1 && !STOP_WORDS.has(word))
    .map(normalizeQuantumWord);
}

/** Index context-free authored Q&A. Multi-turn dialogue documents stay in the training set only. */
export function indexQuantumKnowledge(corpus: string): QuantumKnowledgeEntry[] {
  const canonical = new Map<string, QuantumKnowledgeEntry>();
  for (const rawDocument of corpus.split(/\n\s*\n/)) {
    const document = rawDocument.trim();
    if (!document || document.startsWith("Диалог ")) continue;
    let question: string | null = null;
    for (const rawLine of document.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith("Пользователь:")) {
        question = line.slice("Пользователь:".length).trim();
      } else if (line.startsWith("QQ Quantum:") && question) {
        const answer = line.slice("QQ Quantum:".length).trim();
        const key = normalizeQuantumQuestion(question);
        const terms = new Set(quantumTerms(question));
        if (key && answer && terms.size) canonical.set(key, { question, answer, terms });
        question = null;
      }
    }
  }
  return [...canonical.values()];
}

/** Deliberately conservative match: exact prompt, unique definition, or multiple agreeing content words. */
export function findQuantumKnowledgeAnswer(
  question: string,
  entries: QuantumKnowledgeEntry[],
): string | null {
  const normalized = normalizeQuantumQuestion(question);
  if (normalized) {
    const exact = entries.find(entry => normalizeQuantumQuestion(entry.question) === normalized);
    if (exact) return exact.answer;
  }

  const queryTerms = new Set(quantumTerms(question));
  if (!queryTerms.size) return null;

  if (queryTerms.size === 1) {
    const onlyTerm = [...queryTerms][0];
    const raw = question.toLocaleLowerCase("ru-RU");
    const definitionIntent = ["что такое", "расскажи", "объясни", "дай определение", "определи"]
      .some(marker => raw.includes(marker));
    if (!definitionIntent || onlyTerm.length < 3) return null;

    const matching = entries.filter(entry => entry.terms.has(onlyTerm));
    const direct = matching.filter(entry => entry.terms.size === 1);
    if (direct.length === 1) return direct[0].answer;
    const uniqueAnswers = new Set(matching.map(entry => entry.answer));
    if (uniqueAnswers.size === 1 && matching.length > 0) return matching[0].answer;
    if (matching.length === 1) return matching[0].answer;
    return null;
  }

  let bestAnswer: string | null = null;
  let bestScore = 0;
  let ambiguousBest = false;
  for (const entry of entries) {
    let overlap = 0;
    for (const term of queryTerms) if (entry.terms.has(term)) overlap += 1;
    if (overlap < 2) continue;
    const queryCoverage = overlap / queryTerms.size;
    const knownCoverage = overlap / Math.max(1, entry.terms.size);
    if (queryCoverage < 0.3 || knownCoverage < 0.55) continue;
    const score = 0.55 * queryCoverage + 0.45 * knownCoverage;
    if (score > bestScore + 1e-9) {
      bestAnswer = entry.answer;
      bestScore = score;
      ambiguousBest = false;
    } else if (Math.abs(score - bestScore) <= 1e-9 && bestAnswer !== entry.answer) {
      ambiguousBest = true;
    }
  }
  return ambiguousBest ? null : bestAnswer;
}

export type QuantumPromptMessage = { role: string; content: string };

/** Match the Python training template and fit every prompt into the model's actual token window. */
export function buildQuantumPrompt(
  messages: QuantumPromptMessage[],
  encode: (text: string, addBos?: boolean, addEos?: boolean) => number[],
  maxTokens: number,
): string {
  if (!Number.isInteger(maxTokens) || maxTokens < 2) {
    throw new Error("Для QQ Quantum требуется окно не менее двух токенов.");
  }
  const turns: string[] = [];
  for (const item of messages) {
    const label = item.role === "user" ? "Пользователь" : item.role === "assistant" ? "QQ Quantum" : null;
    if (!label || typeof item.content !== "string") continue;
    const content = item.content
      .replace(/\0/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .join(" ")
      .replaceAll("Пользователь:", "Пользователь")
      .replaceAll("QQ Quantum:", "QQ Quantum")
      .slice(0, 1000);
    if (content) turns.push(label + ": " + content);
  }
  const recent = turns.slice(-6);
  if (recent.length && recent[recent.length - 1].startsWith("QQ Quantum:")) recent.pop();
  if (!recent.length || !recent[recent.length - 1].startsWith("Пользователь:")) {
    throw new Error("Последним сообщением пользователя должен быть вопрос.");
  }
  const isDialogue = recent.some(turn => turn.startsWith("QQ Quantum:"));
  const prefix = isDialogue
    ? "Диалог 1. Продолжай разговор, учитывая предыдущие сообщения."
    : "Ты QQ Quantum — экспериментальная языковая модель. Отвечай по-русски, учитывай контекст, объясняй ясно и не выдумывай факты.";
  const render = () => prefix + "\n" + recent.join("\n") + "\nQQ Quantum:";
  const fits = (prompt: string) => encode(prompt, true, false).length <= maxTokens;
  while (recent.length && !fits(render())) {
    if (recent.length > 1) {
      recent.shift();
      continue;
    }
    const prefixAndContent = recent[0].split(": ");
    const label = prefixAndContent.shift() ?? "Пользователь";
    const content = prefixAndContent.join(": ");
    if (content.length <= 24) break;
    recent[0] = label + ": " + content.slice(0, Math.max(24, Math.floor(content.length * 0.7)));
  }
  const prompt = render();
  if (!fits(prompt)) throw new Error("Сообщение слишком длинное для контекста QQ Quantum.");
  return prompt;
}

export function getQuantumKnownWords(corpus: string): Set<string> {
  return new Set((corpus.toLocaleLowerCase("ru-RU").match(WORD_RE) ?? [])
    .filter(word => word.length >= 3)
    .map(normalizeQuantumWord));
}
