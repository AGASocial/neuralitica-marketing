"use client";

import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { useState } from "react";

import type { InterviewStepKey } from "@/lib/contracts/interview";

import {
  MAX_DESCRIPTION_LENGTH,
  MAX_ITEM_LENGTH,
  MAX_LIST_ITEMS,
  isTextStep,
} from "./step-helpers";

type StepCopy = {
  question: string;
  helper: string;
  placeholder: string;
};

type InterviewStepFieldsCopy = {
  addItem: string;
  removeItem: string;
  itemPlaceholder: string;
  chipsHintRequired: string;
  chipsHintOptional: string;
};

type InterviewStepFieldsProps = {
  step: InterviewStepKey;
  items: string[];
  description: string;
  pending: boolean;
  stepCopy: StepCopy;
  copy: InterviewStepFieldsCopy;
  onItemsChange: (items: string[]) => void;
  onDescriptionChange: (description: string) => void;
  onClearMessage: () => void;
};

export function InterviewStepFields({
  step,
  items,
  description,
  pending,
  stepCopy,
  copy,
  onItemsChange,
  onDescriptionChange,
  onClearMessage,
}: InterviewStepFieldsProps) {
  const [draftItem, setDraftItem] = useState("");

  if (isTextStep(step)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <label htmlFor={`interview-${step}`} style={{ fontWeight: 600 }}>
          {stepCopy.question}
        </label>
        <p style={{ margin: 0, color: "#4b5563", fontSize: "0.9rem" }}>
          {stepCopy.helper}
        </p>
        <InputTextarea
          id={`interview-${step}`}
          value={description}
          onChange={(event) => {
            onClearMessage();
            onDescriptionChange(event.target.value);
          }}
          placeholder={stepCopy.placeholder}
          rows={6}
          autoResize
          disabled={pending}
          maxLength={MAX_DESCRIPTION_LENGTH}
          style={{ width: "100%" }}
        />
      </div>
    );
  }

  const optional = step === "restrictions";

  function addItem() {
    const next = draftItem.trim();
    if (!next) {
      return;
    }
    if (next.length > MAX_ITEM_LENGTH) {
      return;
    }
    if (items.length >= MAX_LIST_ITEMS) {
      return;
    }

    onClearMessage();
    onItemsChange([...items, next]);
    setDraftItem("");
  }

  function removeItem(index: number) {
    onClearMessage();
    onItemsChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  const addBlocked =
    pending ||
    items.length >= MAX_LIST_ITEMS ||
    draftItem.trim().length === 0 ||
    draftItem.trim().length > MAX_ITEM_LENGTH;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <span id={`interview-${step}-label`} style={{ fontWeight: 600 }}>
        {stepCopy.question}
      </span>
      <p style={{ margin: 0, color: "#4b5563", fontSize: "0.9rem" }}>
        {stepCopy.helper}
      </p>
      <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>
        {optional ? copy.chipsHintOptional : copy.chipsHintRequired}
      </p>

      {items.length > 0 ? (
        <ul
          aria-labelledby={`interview-${step}-label`}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {items.map((item, index) => (
            <li
              key={`${index}-${item}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.15rem",
                padding: "0.2rem 0.35rem 0.2rem 0.75rem",
                background: "#eef2ff",
                borderRadius: "999px",
                fontSize: "0.875rem",
              }}
            >
              {item}
              <Button
                type="button"
                icon="pi pi-times"
                rounded
                text
                aria-label={copy.removeItem}
                onClick={() => removeItem(index)}
                disabled={pending}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
        <InputText
          id={`interview-${step}-item`}
          value={draftItem}
          onChange={(event) => setDraftItem(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem();
            }
          }}
          placeholder={stepCopy.placeholder || copy.itemPlaceholder}
          disabled={pending || items.length >= MAX_LIST_ITEMS}
          maxLength={MAX_ITEM_LENGTH}
          style={{ flex: 1 }}
          aria-labelledby={`interview-${step}-label`}
        />
        <Button
          type="button"
          label={copy.addItem}
          onClick={addItem}
          disabled={addBlocked}
        />
      </div>
    </div>
  );
}
