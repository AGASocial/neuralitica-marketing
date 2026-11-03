import type { AvatarRecord } from "@/lib/contracts/avatar";
import {
  avatarGenderSchema,
  avatarLanguageSchema,
  elevenLabsVoiceIdSchema,
} from "@/lib/contracts/avatar";

export type AvatarSelectRow = {
  id: string;
  client_id: string;
  gender: string;
  language: string;
  elevenlabs_voice_id: string | null;
  updated_at: string;
};

export function mapAvatarRow(row: AvatarSelectRow): AvatarRecord | null {
  const gender = avatarGenderSchema.safeParse(row.gender);
  const language = avatarLanguageSchema.safeParse(row.language);
  if (!gender.success || !language.success) {
    return null;
  }

  let elevenLabsVoiceId: string | null = null;
  if (row.elevenlabs_voice_id != null && row.elevenlabs_voice_id !== "") {
    const parsed = elevenLabsVoiceIdSchema.safeParse(row.elevenlabs_voice_id);
    if (!parsed.success) {
      return null;
    }
    elevenLabsVoiceId = parsed.data;
  }

  const updatedAt = new Date(row.updated_at).toISOString();

  return {
    id: row.id,
    clientId: row.client_id,
    gender: gender.data,
    language: language.data,
    elevenLabsVoiceId,
    updatedAt,
  };
}
