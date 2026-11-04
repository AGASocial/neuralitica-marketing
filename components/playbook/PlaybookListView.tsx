"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
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
      <div className="mx-auto max-w-[1100px]">
        <PageHeader copy={copy} />
        <StatusAlert severity="error" text={copy.loadError} className="w-full" />
        <Button
          type="button"
          variant="ghost"
          className="mt-4"
          onClick={() => router.push("/dashboard")}
        >
          {copy.backDashboard}
        </Button>
      </div>
    );
  }

  const formatos = result.formatos;

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader copy={copy} showCreate />

      {formatos.length === 0 ? (
        <StatusAlert severity="info" text={copy.empty} className="w-full" />
      ) : (
        <div className="rounded-xl border border-edge bg-panel">
          <Table>
            <TableHeader>
              <TableRow className="border-edge hover:bg-transparent">
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.slug}
                </TableHead>
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.titulo}
                </TableHead>
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.status}
                </TableHead>
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.version}
                </TableHead>
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.updatedAt}
                </TableHead>
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {formatos.map((row: PlaybookListItem) => (
                <TableRow
                  key={row.slug}
                  className={cn(
                    "border-edge hover:bg-edge/20",
                    !row.active && "opacity-60",
                  )}
                >
                  <TableCell className="px-4 py-3 text-fog">{row.slug}</TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-fog">
                    {row.titulo}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <StatusBadge
                      severity={row.active ? "success" : "secondary"}
                      value={row.active ? copy.status.active : copy.status.archived}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-fog">{row.version}</TableCell>
                  <TableCell className="px-4 py-3 text-fog">
                    {formatDate(row.updatedAt, locale)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Button asChild size="sm">
                      <Link href={`/operator/playbook/${row.slug}`}>{copy.edit}</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="mb-2 font-display text-4xl text-fog">{copy.title}</h1>
        <p className="text-dim">{copy.subtitle}</p>
      </div>
      {showCreate ? (
        <Button asChild>
          <Link href="/operator/playbook/new">
            <PlusIcon />
            {copy.create}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
