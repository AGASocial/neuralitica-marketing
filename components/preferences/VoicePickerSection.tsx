"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StatusAlert } from "@/components/ui/status-alert";
import type { TtsVoiceId, TtsVoiceOptionDto } from "@/lib/contracts/visual-preferences";

export type VoicePickerCopy = {
  title: string;
  hiddenNoAiVoice: string;
  sampleLabel: string;
  aiOnlyNote: string;
  labels: Record<TtsVoiceId, string>;
};

type VoicePickerSectionProps = {
  availableVoices: TtsVoiceOptionDto[];
  selectedVoiceId: TtsVoiceId | null;
  visible: boolean;
  pending: boolean;
  copy: VoicePickerCopy;
  onSelect: (voiceId: TtsVoiceId) => void;
};

function resolveVoiceLabel(
  voice: TtsVoiceOptionDto,
  copy: VoicePickerCopy,
): string {
  return copy.labels[voice.id] ?? voice.id;
}

/**
 * Preferencias default TTS voice picker (US-9.3).
 * Sample playback via same-origin public MP3s — no vendor ids in UI.
 */
export function VoicePickerSection({
  availableVoices,
  selectedVoiceId,
  visible,
  pending,
  copy,
  onSelect,
}: VoicePickerSectionProps) {
  if (!visible) {
    return (
      <StatusAlert severity="info" text={copy.hiddenNoAiVoice} className="w-full" />
    );
  }

  if (availableVoices.length === 0) {
    return null;
  }

  const enVoices = availableVoices.filter((voice) => voice.locale === "en");
  const esVoices = availableVoices.filter((voice) => voice.locale === "es");

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-edge bg-panel px-5 py-4">
      <div>
        <h2 className="mb-1.5 font-display text-xl text-fog">{copy.title}</h2>
        <p className="text-sm text-dim">{copy.aiOnlyNote}</p>
      </div>

      <RadioGroup
        name="pref-voice"
        value={selectedVoiceId ?? ""}
        onValueChange={(value) => onSelect(value as TtsVoiceId)}
        disabled={pending}
        className="gap-4"
      >
        {[enVoices, esVoices].map((group) =>
          group.length === 0 ? null : (
            <div key={group[0]!.locale} className="flex flex-col gap-3">
              {group.map((voice) => {
                const inputId = `pref-voice-${voice.id}`;

                return (
                  <div key={voice.id} className="flex flex-wrap items-start gap-3">
                    <RadioGroupItem value={voice.id} id={inputId} className="mt-1" />
                    <div className="min-w-48 flex-1">
                      <Label
                        htmlFor={inputId}
                        className={
                          pending
                            ? "mb-1.5 block cursor-default font-medium text-fog"
                            : "mb-1.5 block cursor-pointer font-medium text-fog"
                        }
                      >
                        {resolveVoiceLabel(voice, copy)}
                      </Label>
                      <audio
                        controls
                        preload="none"
                        src={voice.sampleUrl}
                        aria-label={`${copy.sampleLabel}: ${resolveVoiceLabel(voice, copy)}`}
                        className="h-8 w-full max-w-80"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ),
        )}
      </RadioGroup>
    </section>
  );
}
