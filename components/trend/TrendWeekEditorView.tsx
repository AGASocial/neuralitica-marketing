"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Message } from "primereact/message";
import { Tag } from "primereact/tag";

import type { TrendEntryCore, TrendSnapshotOperatorView } from "@/lib/contracts/trend";
import { formatWeekRange } from "@/lib/trend/normalize-week-start";

type TrendWeekEditorCopy = {
  title: string;
  subtitle: string;
  addEntry: string;
  backList: string;
  empty: string;
  publishedLabel: string;
  updatedLabel: string;
  columns: {
    prioridad: string;
    titulo: string;
    slug: string;
    status: string;
    actions: string;
  };
  status: {
    active: string;
    inactive: string;
  };
  edit: string;
};

type TrendWeekEditorViewProps = {
  snapshot: TrendSnapshotOperatorView;
  locale: string;
  copy: TrendWeekEditorCopy;
};

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function TrendWeekEditorView({
  snapshot,
  locale,
  copy,
}: TrendWeekEditorViewProps) {
  const router = useRouter();
  const weekLabel = formatWeekRange(snapshot.weekStart, locale);

  const sortedEntries = [...snapshot.entries].sort(
    (a, b) => a.prioridad_semana - b.prioridad_semana || a.slug.localeCompare(b.slug),
  );

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 0.5rem", fontSize: "2rem" }}>{copy.title}</h1>
          <p style={{ margin: 0, color: "#4b5563" }}>{copy.subtitle}</p>
          <p style={{ margin: "0.75rem 0 0", fontWeight: 600, color: "#111827" }}>
            {weekLabel}
          </p>
          <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.9rem" }}>
            {copy.publishedLabel}: {formatDate(snapshot.publishedAt, locale)} ·{" "}
            {copy.updatedLabel}: {formatDate(snapshot.updatedAt, locale)}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link
            href={`/operator/trends/${snapshot.weekStart}/new`}
            style={{ textDecoration: "none" }}
          >
            <Button type="button" label={copy.addEntry} icon="pi pi-plus" />
          </Link>
          <Button
            type="button"
            label={copy.backList}
            severity="secondary"
            outlined
            onClick={() => router.push("/operator/trends")}
          />
        </div>
      </div>

      {sortedEntries.length === 0 ? (
        <Message severity="info" text={copy.empty} style={{ width: "100%" }} />
      ) : (
        <DataTable
          value={sortedEntries}
          stripedRows
          rowClassName={(row: TrendEntryCore) =>
            row.activo ? "" : "trend-row-inactive"
          }
          emptyMessage={copy.empty}
        >
          <Column field="prioridad_semana" header={copy.columns.prioridad} />
          <Column field="titulo" header={copy.columns.titulo} />
          <Column field="slug" header={copy.columns.slug} />
          <Column
            header={copy.columns.status}
            body={(row: TrendEntryCore) => (
              <Tag
                severity={row.activo ? "success" : "secondary"}
                value={row.activo ? copy.status.active : copy.status.inactive}
              />
            )}
          />
          <Column
            header={copy.columns.actions}
            body={(row: TrendEntryCore) => (
              <Link href={`/operator/trends/${snapshot.weekStart}/${row.slug}`}>
                <Button type="button" label={copy.edit} size="small" />
              </Link>
            )}
          />
        </DataTable>
      )}
    </div>
  );
}
