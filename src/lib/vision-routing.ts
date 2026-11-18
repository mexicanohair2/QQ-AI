export type VisionMode = "online" | "offline";
export type VisionBackend = "cloud" | "local" | "unavailable";

export function selectVisionBackend(
  mode: VisionMode,
  cloudVisionReady: boolean,
  localVisionReady: boolean,
): VisionBackend {
  if (mode === "online" && cloudVisionReady) return "cloud";
  if (localVisionReady) return "local";
  return "unavailable";
}

export function canAttachMedia(
  mode: VisionMode,
  cloudVisionReady: boolean,
  localVisionReady: boolean,
): boolean {
  return selectVisionBackend(mode, cloudVisionReady, localVisionReady) !== "unavailable";
}

export function selectLocalVideoFrames<T extends { timestampMs: number }>(
  frames: readonly T[],
  limit = 4,
): T[] {
  const maximum = Math.max(1, Math.min(4, Math.floor(limit)));
  if (frames.length <= maximum) return [...frames];
  if (maximum === 1) return [frames[Math.floor((frames.length - 1) / 2)]];

  const selected: T[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < maximum; index += 1) {
    const frameIndex = Math.round(index * (frames.length - 1) / (maximum - 1));
    if (!seen.has(frameIndex)) {
      selected.push(frames[frameIndex]);
      seen.add(frameIndex);
    }
  }
  return selected;
}
