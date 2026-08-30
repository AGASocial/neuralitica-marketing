import type { ProjectionHintKey } from "@/lib/contracts/cost-policy";
import type { VisualMode } from "@/lib/contracts/providers";
import type { VisualModality } from "@/lib/contracts/visual-preferences";

export function resolveProjectionHintKey(params: {
  visualMode: VisualMode;
  modalidad: VisualModality;
  hasBrollBeats: boolean;
}): ProjectionHintKey | null {
  if (params.modalidad === "faceless" || params.hasBrollBeats) {
    return "faceless_broll_later";
  }
  if (params.visualMode === "own_avatar") {
    return "own_avatar_video_later";
  }
  if (params.visualMode === "generic_avatar") {
    return "generic_avatar_video_later";
  }
  return null;
}
