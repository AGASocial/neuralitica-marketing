"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Message } from "primereact/message";
import { Tag } from "primereact/tag";

import type {
  PlaybookListForOperatorResult,
  PlaybookListItem,
} from "@/lib/contracts/playbook";

type PlaybookListCopy = {
  title: string;
  subtitle: string;
  create: string;
  empty: string;
  loadError: string;
  backDashboard: string;
  columns: {
    slug: string;
    titulo: string;
    status: string;
    version: string;
    updatedAt: string;
    actions: string;
  };
  status: {
    active: string;
    archived: string;
  };
  edit: string;
};

type PlaybookListViewProps = {
  result: PlaybookListForOperatorResult;
  locale: string;
  copy: PlaybookListCopy;
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

export function PlaybookListView({
  result,
  locale,
  copy,
}: PlaybookListViewProps) {
  const router = useRouter();

  if (!result.ok) {
    return (
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <PageHeader copy={copy} />
        <Message severity="error" text={copy.loadError} style={{ width: "100%" }} />
        <Button
          type="button"
          label={copy.backDashboard}
          className="p-button-text"
          style={{ marginTop: "1rem" }}
          onClick={() => router.push("/dashboard")}
        />
      </div>
    );
  }

  const formatos = result.formatos;

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <PageHeader copy={copy} showCreate />

      {formatos.length === 0 ? (
        <Message severity="info" text={copy.empty} style={{ width: "100%" }} />
      ) : (
        <DataTable
          value={formatos}
          stripedRows
          rowClassName={(row: PlaybookListItem) =>
            row.active ? "" : "playbook-row-archived"
          }
          emptyMessage={copy.empty}
        >
          <Column field="slug" header={copy.columns.slug} />
          <Column field="titulo" header={copy.columns.titulo} />
          <Column
            header={copy.columns.status}
            body={(row: PlaybookListItem) => (
              <Tag
                severity={row.active ? "success" : "secondary"}
                value={row.active ? copy.status.active : copy.status.archived}
              />
            )}
          />
          <Column field="version" header={copy.columns.version} />
          <Column
            header={copy.columns.updatedAt}
            body={(row: PlaybookListItem) =>
              formatDate(row.updatedAt, locale)
            }
          />
          <Column
            header={copy.columns.actions}
            body={(row: PlaybookListItem) => (
              <Link href={`/operator/playbook/${row.slug}`}>
                <Button type="button" label={copy.edit} size="small" />
              </Link>
            )}
          />
        </DataTable>
      )}
    </div>
  );
}

function PageHeader({
  copy,
  showCreate = false,
}: {
  copy: PlaybookListCopy;
  showCreate?: boolean;
}) {
  return (
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
      </div>
      {showCreate ? (
        <Link href="/operator/playbook/new" style={{ textDecoration: "none" }}>
          <Button type="button" label={copy.create} icon="pi pi-plus" />
        </Link>
      ) : null}
    </div>
  );
}
