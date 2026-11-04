"use client";

import { XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
      <div className="flex flex-col gap-3">
        <Label htmlFor={`interview-${step}`} className="font-semibold text-fog">
          {stepCopy.question}
        </Label>
        <p className="text-[0.9rem] text-dim">{stepCopy.helper}</p>
        <Textarea
          id={`interview-${step}`}
          value={description}
          onChange={(event) => {
            onClearMessage();
            onDescriptionChange(event.target.value);
          }}
          placeholder={stepCopy.placeholder}
          rows={6}
          disabled={pending}
          maxLength={MAX_DESCRIPTION_LENGTH}
          className="w-full"
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
    <div className="flex flex-col gap-3">
      <span id={`interview-${step}-label`} className="font-semibold text-fog">
        {stepCopy.question}
      </span>
      <p className="text-[0.9rem] text-dim">{stepCopy.helper}</p>
      <p className="text-[0.85rem] text-dim">
        {optional ? copy.chipsHintOptional : copy.chipsHintRequired}
      </p>

      {items.length > 0 ? (
        <ul
          aria-labelledby={`interview-${step}-label`}
          className="m-0 flex list-none flex-wrap gap-2 p-0"
        >
          {items.map((item, index) => (
            <li
              key={`${index}-${item}`}
              className="inline-flex items-center gap-1 rounded-full border border-edge bg-deep/60 py-1 pr-1 pl-3 text-sm text-fog"
            >
              {item}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="rounded-full"
                aria-label={copy.removeItem}
                onClick={() => removeItem(index)}
                disabled={pending}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-start gap-2">
        <Input
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
          className="flex-1"
          aria-labelledby={`interview-${step}-label`}
        />
        <Button type="button" onClick={addItem} disabled={addBlocked}>
          {copy.addItem}
        </Button>
      </div>
    </div>
  );
}
