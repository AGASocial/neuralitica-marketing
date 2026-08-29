"use client";

import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";

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
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "1rem",
        margin: 0,
      }}
      disabled={disabled}
    >
      <legend style={{ fontWeight: 600, padding: "0 0.25rem" }}>{label}</legend>
      {hint ? (
        <p style={{ margin: "0 0 0.75rem", color: "#6b7280", fontSize: "0.9rem" }}>
          {hint}
        </p>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {items.map((item, index) => (
          <div
            key={`${idPrefix}-${index}`}
            style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
          >
            <InputText
              id={`${idPrefix}-${index}`}
              value={item}
              onChange={(event) => updateItem(index, event.target.value)}
              placeholder={placeholder}
              style={{ flex: 1 }}
              disabled={disabled}
            />
            <Button
              type="button"
              icon="pi pi-trash"
              severity="secondary"
              outlined
              aria-label={removeLabel}
              onClick={() => removeItem(index)}
              disabled={disabled || items.length <= minItems}
            />
          </div>
        ))}
      </div>
      <Button
        type="button"
        label={addLabel}
        icon="pi pi-plus"
        severity="secondary"
        outlined
        size="small"
        style={{ marginTop: "0.75rem" }}
        onClick={addItem}
        disabled={disabled || items.length >= maxItems}
      />
    </fieldset>
  );
}
