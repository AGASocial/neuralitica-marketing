"use client";

import Link from "next/link";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { Tag } from "primereact/tag";

import type { ApprovedListItemDto } from "@/lib/contracts/approval";

export type ReadyToPublishListCopy = {
  title: string;
  subtitle: string;
  empty: string;
  loadError: string;
  backDashboard: string;
  viewCta: string;
  decidedAt: string;
  disclosureChip: string;
  approvedStatus: string;
};

type ReadyToPublishListViewProps = {
  items: ApprovedListItemDto[];
  loadFailed: boolean;
  locale: "en" | "es";
  copy: ReadyToPublishListCopy;
};

function formatDecidedAt(iso: string, locale: "en" | "es"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ReadyToPublishListView({
  items,
  loadFailed,
  locale,
  copy,
}: ReadyToPublishListViewProps) {
  return (
    <div style={{ maxWidth: "720px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <Link
          href="/dashboard"
          style={{
            color: "#4b5563",
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          ← {copy.backDashboard}
        </Link>
        <h1 style={{ margin: "0.75rem 0 0.35rem", fontSize: "1.75rem" }}>
          {copy.title}
        </h1>
        <p style={{ margin: 0, color: "#4b5563" }}>{copy.subtitle}</p>
      </div>

      {loadFailed ? (
        <Message severity="error" text={copy.loadError} style={{ width: "100%" }} />
      ) : null}

      {!loadFailed && items.length === 0 ? (
        <Message severity="info" text={copy.empty} style={{ width: "100%" }} />
      ) : null}

      {!loadFailed && items.length > 0 ? (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {items.map((item) => (
            <li
              key={item.approvalId}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                padding: "1rem 1.1rem",
                background: "#ffffff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                }}
              >
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.4rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <Tag value={copy.approvedStatus} severity="success" />
                    {item.hasDisclosure ? (
                      <Tag value={copy.disclosureChip} severity="info" />
                    ) : null}
                  </div>
                  <p
                    style={{
                      margin: "0 0 0.35rem",
                      color: "#111827",
                      lineHeight: 1.45,
                      wordBreak: "break-word",
                    }}
                  >
                    {item.captionPreview?.trim() ? item.captionPreview : "—"}
                  </p>
                  <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem" }}>
                    {copy.decidedAt.replace(
                      "{date}",
                      formatDecidedAt(item.decidedAt, locale),
                    )}
                  </p>
                </div>
                <Link
                  href={`/ready-to-publish/${item.approvalId}`}
                  style={{ textDecoration: "none", flexShrink: 0 }}
                >
                  <Button type="button" label={copy.viewCta} size="small" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
