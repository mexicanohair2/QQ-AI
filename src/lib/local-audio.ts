export const SPEECH_SAMPLE_RATE = 16_000;
export const MAX_LOCAL_SPEECH_SECONDS = 20;
export const MAX_LOCAL_SPEECH_SAMPLES = SPEECH_SAMPLE_RATE * MAX_LOCAL_SPEECH_SECONDS;

/**
 * Mixes decoded channels to mono and resamples to Whisper's 16 kHz input.
 * This is in-memory DSP only; it does not access storage or the network.
 */
export function resampleTo16kMono(
  channels: readonly Float32Array[],
  sourceSampleRate: number,
  maxSeconds = MAX_LOCAL_SPEECH_SECONDS,
): Float32Array {
  if (!Number.isFinite(sourceSampleRate) || sourceSampleRate < 8_000 || sourceSampleRate > 192_000) {
    throw new Error("Частота аудио не поддерживается.");
  }
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > 60) {
    throw new Error("Некорректное ограничение длительности аудио.");
  }
  if (!Array.isArray(channels) || channels.length === 0 || channels.length > 8) {
    throw new Error("Не удалось получить аудиоканалы микрофона.");
  }

  const inputLength = channels[0]?.length ?? 0;
  if (!Number.isInteger(inputLength) || inputLength < 1) {
    throw new Error("Запись не содержит аудиоданных.");
  }
  if (inputLength / sourceSampleRate > maxSeconds + 0.05) {
    throw new Error("Запись слишком длинная. Максимум — " + maxSeconds + " секунд.");
  }
  if (channels.some(channel => !(channel instanceof Float32Array) || channel.length !== inputLength)) {
    throw new Error("Аудиоканалы имеют несовместимый формат.");
  }

  const mono = new Float32Array(inputLength);
  const channelScale = 1 / channels.length;
  for (const channel of channels) {
    for (let index = 0; index < inputLength; index += 1) {
      const sample = channel[index];
      mono[index] += Number.isFinite(sample) ? sample * channelScale : 0;
    }
  }

  const outputLength = Math.floor(inputLength * SPEECH_SAMPLE_RATE / sourceSampleRate);
  if (outputLength < 1 || outputLength > MAX_LOCAL_SPEECH_SAMPLES) {
    throw new Error("Размер записи превышает допустимый предел.");
  }
  if (sourceSampleRate === SPEECH_SAMPLE_RATE) return mono;

  const output = new Float32Array(outputLength);
  const ratio = sourceSampleRate / SPEECH_SAMPLE_RATE;
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const left = Math.min(inputLength - 1, Math.floor(position));
    const right = Math.min(inputLength - 1, left + 1);
    const fraction = position - left;
    const sample = mono[left] + (mono[right] - mono[left]) * fraction;
    output[index] = Math.max(-1, Math.min(1, sample));
  }
  return output;
}

export function appendTranscript(current: string, transcript: string): string {
  const left = typeof current === "string" ? current.trimEnd() : "";
  const right = typeof transcript === "string"
    ? transcript.replace(/\s+/g, " ").trim()
    : "";
  if (!right) return typeof current === "string" ? current : "";
  return left ? left + " " + right : right;
}
