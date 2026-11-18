export type LocalRuntime = "text" | "vision" | "speech";

/** Keep only one heavyweight local model active on a mobile GPU at a time. */
export function getOtherLocalRuntimes(target: LocalRuntime): LocalRuntime[] {
  return (["text", "vision", "speech"] as const).filter(runtime => runtime !== target);
}
