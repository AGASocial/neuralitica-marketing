"use client";

import { RadioButton } from "primereact/radiobutton";
import { Message } from "primereact/message";

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
      <Message
        severity="info"
        text={copy.hiddenNoAiVoice}
        style={{ width: "100%" }}
      />
    );
  }

  if (availableVoices.length === 0) {
    return null;
  }

  const enVoices = availableVoices.filter((voice) => voice.locale === "en");
  const esVoices = availableVoices.filter((voice) => voice.locale === "es");

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "1rem 1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <div>
        <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.1rem" }}>{copy.title}</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem" }}>
          {copy.aiOnlyNote}
        </p>
      </div>

      {[enVoices, esVoices].map((group) =>
        group.length === 0 ? null : (
          <div
            key={group[0]!.locale}
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            {group.map((voice) => {
              const inputId = `pref-voice-${voice.id}`;
              const checked = selectedVoiceId === voice.id;

              return (
                <div
                  key={voice.id}
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <RadioButton
                    inputId={inputId}
                    name="pref-voice"
                    value={voice.id}
                    checked={checked}
                    disabled={pending}
                    onChange={() => onSelect(voice.id)}
                  />
                  <div style={{ flex: 1, minWidth: "12rem" }}>
                    <label
                      htmlFor={inputId}
                      style={{
                        display: "block",
                        fontWeight: 500,
                        marginBottom: "0.35rem",
                        cursor: pending ? "default" : "pointer",
                      }}
                    >
                      {resolveVoiceLabel(voice, copy)}
                    </label>
                    <audio
                      controls
                      preload="none"
                      src={voice.sampleUrl}
                      aria-label={`${copy.sampleLabel}: ${resolveVoiceLabel(voice, copy)}`}
                      style={{ width: "100%", maxWidth: "320px", height: "32px" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ),
      )}
    </section>
  );
}
