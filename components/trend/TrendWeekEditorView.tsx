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
import type { TrendSnapshotOperatorView } from "@/lib/contracts/trend";
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
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 font-display text-4xl text-fog">{copy.title}</h1>
          <p className="text-dim">{copy.subtitle}</p>
          <p className="mt-3 font-semibold text-fog">{weekLabel}</p>
          <p className="mt-1 text-[0.9rem] text-dim">
            {copy.publishedLabel}: {formatDate(snapshot.publishedAt, locale)} ·{" "}
            {copy.updatedLabel}: {formatDate(snapshot.updatedAt, locale)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/operator/trends/${snapshot.weekStart}/new`}>
              <PlusIcon />
              {copy.addEntry}
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/operator/trends")}
          >
            {copy.backList}
          </Button>
        </div>
      </div>

      {sortedEntries.length === 0 ? (
        <StatusAlert severity="info" text={copy.empty} className="w-full" />
      ) : (
        <div className="rounded-xl border border-edge bg-panel">
          <Table>
            <TableHeader>
              <TableRow className="border-edge hover:bg-transparent">
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.prioridad}
                </TableHead>
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.titulo}
                </TableHead>
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.slug}
                </TableHead>
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.status}
                </TableHead>
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEntries.map((row) => (
                <TableRow
                  key={row.slug}
                  className={cn(
                    "border-edge hover:bg-edge/20",
                    !row.activo && "opacity-60",
                  )}
                >
                  <TableCell className="px-4 py-3 text-fog">
                    {row.prioridad_semana}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-fog">
                    {row.titulo}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-fog">{row.slug}</TableCell>
                  <TableCell className="px-4 py-3">
                    <StatusBadge
                      severity={row.activo ? "success" : "secondary"}
                      value={row.activo ? copy.status.active : copy.status.inactive}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Button asChild size="sm">
                      <Link href={`/operator/trends/${snapshot.weekStart}/${row.slug}`}>
                        {copy.edit}
                      </Link>
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
