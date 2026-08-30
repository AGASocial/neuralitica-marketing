"use client";

import { ProgressSpinner } from "primereact/progressspinner";

type ScriptsLoadingProps = {
  label: string;
};

export function ScriptsLoading({ label }: ScriptsLoadingProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        minHeight: "240px",
        color: "#4b5563",
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <ProgressSpinner style={{ width: "48px", height: "48px" }} strokeWidth="4" />
      <span>{label}</span>
    </div>
  );
}
