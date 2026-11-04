"use client";

import { PlusIcon, TrashIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type StringListEditorProps = {
  idPrefix: string;
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  addLabel: string;
  removeLabel: string;
  placeholder: string;
  disabled?: boolean;
  minItems?: number;
  maxItems?: number;
};

export function StringListEditor({
  idPrefix,
  label,
  hint,
  items,
  onChange,
  addLabel,
  removeLabel,
  placeholder,
  disabled = false,
  minItems = 1,
  maxItems = 20,
}: StringListEditorProps) {
  function updateItem(index: number, value: string) {
    const next = [...items];
    next[index] = value;
    onChange(next);
  }

  function addItem() {
    if (items.length >= maxItems) {
      return;
    }
    onChange([...items, ""]);
  }

  function removeItem(index: number) {
    if (items.length <= minItems) {
      return;
    }
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <fieldset
      className="m-0 rounded-xl border border-edge p-4"
      disabled={disabled}
    >
      <legend className="px-1 font-semibold text-fog">{label}</legend>
      {hint ? <p className="mb-3 text-[0.9rem] text-dim">{hint}</p> : null}
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <div key={`${idPrefix}-${index}`} className="flex items-center gap-2">
            <Input
              id={`${idPrefix}-${index}`}
              value={item}
              onChange={(event) => updateItem(index, event.target.value)}
              placeholder={placeholder}
              className="flex-1"
              disabled={disabled}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={removeLabel}
              onClick={() => removeItem(index)}
              disabled={disabled || items.length <= minItems}
            >
              <TrashIcon />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={addItem}
        disabled={disabled || items.length >= maxItems}
      >
        <PlusIcon />
        {addLabel}
      </Button>
    </fieldset>
  );
}
