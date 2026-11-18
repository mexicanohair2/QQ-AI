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
