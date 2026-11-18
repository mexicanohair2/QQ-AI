const number = "-?\\d+(?:[.,]\\d+)?";

function parseNumber(value: string): number {
  return Number(value.replace(",", "."));
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Результат не является конечным числом.");
  const rounded = Math.round((value + Number.EPSILON) * 1e8) / 1e8;
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 8 }).format(rounded);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

function evaluateExpression(source: string): number | null {
  const tokens = source.match(/\d+(?:\.\d+)?|[()+*/%-]/g);
  if (!tokens || tokens.join("") !== source.replace(/\s+/g, "")) return null;
  let index = 0;

  function primary(): number {
    const token = tokens[index++];
    if (token === "(") {
      const value = sum();
      if (tokens[index++] !== ")") throw new Error("Проверь скобки в примере.");
      return value;
    }
    if (token === "+" || token === "-") {
      const value = primary();
      return token === "-" ? -value : value;
    }
    if (!token || !/^\d/.test(token)) throw new Error("Проверь математическое выражение.");
    let value = Number(token);
    if (tokens[index] === "%") { index++; value /= 100; }
    return value;
  }

  function product(): number {
    let value = primary();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const operator = tokens[index++];
      const right = primary();
      if (operator === "/" && right === 0) throw new Error("На ноль делить нельзя.");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  function sum(): number {
    let value = product();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index++];
      const right = product();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  const result = sum();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error("Не удалось вычислить выражение.");
  return result;
}

export function calculateMathQuestion(question: string): string | null {
  const original = question.trim();
  if (!original || original.length > 180) return null;
  const normalized = original.toLowerCase().replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/");

  const percentOf = normalized.match(new RegExp("(" + number + ")\\s*%\\s*(?:от|of)\\s*(" + number + ")", "i"));
  if (percentOf) {
    const percent = parseNumber(percentOf[1]);
    const total = parseNumber(percentOf[2]);
    const result = total * percent / 100;
    return `**Расчёт:** ${formatNumber(total)} × ${formatNumber(percent)} ÷ 100 = ${formatNumber(result)}.\n\n**Ответ: ${formatNumber(result)}**`;
  }

  const percentShare = normalized.match(new RegExp("(?:сколько\\s+)?процентов?\\s+(?:составляет|это|будет)\\s+(" + number + ")\\s+(?:от|из)\\s+(" + number + ")", "i"));
  if (percentShare) {
    const part = parseNumber(percentShare[1]);
    const total = parseNumber(percentShare[2]);
    if (total === 0) return "Нельзя вычислить процент от нуля: деление на ноль не определено.";
    const result = part / total * 100;
    return `**Расчёт:** ${formatNumber(part)} ÷ ${formatNumber(total)} × 100% = ${formatNumber(result)}%.\n\n**Ответ: ${formatNumber(result)}%**`;
  }

  const discount = normalized.match(new RegExp("(" + number + ")\\s*(?:со\\s+скидкой|минус)\\s*(" + number + ")\\s*%", "i"));
  if (discount) {
    const price = parseNumber(discount[1]);
    const percent = parseNumber(discount[2]);
    const result = price * (1 - percent / 100);
    return `Скидка ${formatNumber(percent)}% от ${formatNumber(price)} составляет ${formatNumber(price * percent / 100)}.\n\n**Итоговая цена: ${formatNumber(result)}**`;
  }

  const ratio = normalized.match(new RegExp("(?:сократи|упрости|сократить)\\s+(?:отношение|пропорцию)\\s+(" + number + ")\\s*(?::|к)\\s*(" + number + ")", "i"));
  if (ratio) {
    const a = parseNumber(ratio[1]);
    const b = parseNumber(ratio[2]);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === 0 || b === 0) return null;
    const divisor = gcd(a, b);
    return `Делим обе части отношения ${formatNumber(a)} : ${formatNumber(b)} на ${divisor}.\n\n**Ответ: ${a / divisor} : ${b / divisor}**`;
  }

  let expression = normalized
    .replace(/^(?:пожалуйста[, ]*)?(?:посчитай|вычисли|рассчитай|найди|сколько будет|чему равно|сколько получится|реши)\s*/i, "")
    .replace(/\s*(?:равно|посчитать|вычислить)\s*\??$/i, "")
    .replace(/умножить\s+на|\bумножить\b/gi, "*")
    .replace(/разделить\s+на|делить\s+на/gi, "/")
    .replace(/\bплюс\b/gi, "+")
    .replace(/\bминус\b/gi, "-")
    .replace(/\bи\b/gi, "")
    .replace(/[?=]/g, "")
    .trim();

  if (!expression || expression.length > 120 || !/[+*/%()-]/.test(expression)) return null;
  if (!/^[\d\s.,()+*/%-]+$/.test(expression)) return null;
  expression = expression.replace(/,/g, ".").replace(/\s+/g, "");
  try {
    const result = evaluateExpression(expression);
    if (result === null) return null;
    return `**Результат:** ${formatNumber(result)}`;
  } catch (error) {
    return error instanceof Error ? error.message : "Не удалось выполнить вычисление.";
  }
}
