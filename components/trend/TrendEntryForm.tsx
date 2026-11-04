"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { NumberInput } from "@/components/ui/number-input";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { StringListEditor } from "@/components/playbook/StringListEditor";
import {
  PLAYBOOK_HOOK_TYPES,
  PLAYBOOK_RUBROS,
  type PlaybookHookType,
  type PlaybookRubro,
} from "@/lib/contracts/playbook";
import type {
  TrendEntryCore,
  TrendEntryFormFields,
  TrendErrorCode,
} from "@/lib/contracts/trend";
import { emptyTrendEntryFields } from "@/lib/contracts/trend";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import { addTrendEntry } from "@/lib/trend/add-trend-entry";
import { deactivateTrendEntry } from "@/lib/trend/deactivate-trend-entry";
import { updateTrendEntry } from "@/lib/trend/update-trend-entry";

const MODALITY_ORDER: VisualModality[] = [
  "own_avatar",
  "generic_avatar",
  "faceless",
];

const PRIORIDAD_OPTIONS = [1, 2, 3, 4, 5];

type PlaybookSlugOption = {
  slug: string;
  titulo: string;
};

type TrendEntryFormCopy = {
  createTitle: string;
  editTitle: string;
  subtitle: string;
  save: string;
  create: string;
  cancel: string;
  saving: string;
  deactivating: string;
  deactivate: string;
  backWeek: string;
  toastCreateSuccess: string;
  toastSaveSuccess: string;
  toastDeactivateSuccess: string;
  inactiveBanner: string;
  fields: {
    slug: string;
    slugHint: string;
    titulo: string;
    prioridadSemana: string;
    explicacion: string;
    evitar: string;
    evitarHint: string;
    estructura: string;
    estructuraHint: string;
    hookType: string;
    duracionColdOpen: string;
    duracionTotal: string;
    modalidades: string;
    modalidadesHint: string;
    rubros: string;
    rubrosHint: string;
    formatosPlaybook: string;
    formatosPlaybookHint: string;
    guionHints: string;
    guionHintsHint: string;
    editingHints: string;
    editingHintsHint: string;
    ejemploReferencia: string;
    ejemploReferenciaHint: string;
  };
  hookTypes: Record<PlaybookHookType, string>;
  rubros: Record<PlaybookRubro, string>;
  modalities: Record<VisualModality, string>;
  list: {
    addItem: string;
    removeItem: string;
    beatPlaceholder: string;
    hintPlaceholder: string;
    editingHintPlaceholder: string;
  };
  confirmDeactivate: {
    header: string;
    message: string;
    accept: string;
    reject: string;
  };
  errors: {
    validation: string;
    forbiddenFields: string;
    notFound: string;
    duplicateSlug: string;
    weekStartMismatch: string;
    invalidPlaybookSlug: string;
    unauthenticated: string;
    forbidden: string;
    internal: string;
    slugRequired: string;
    slugFormat: string;
    formatosRequired: string;
  };
};

type TrendEntryFormProps =
  | {
      mode: "create";
      weekStart: string;
      playbookOptions: PlaybookSlugOption[];
      copy: TrendEntryFormCopy;
    }
  | {
      mode: "edit";
      weekStart: string;
      initial: TrendEntryCore;
      playbookOptions: PlaybookSlugOption[];
      copy: TrendEntryFormCopy;
    };

function entryToFormFields(entry: TrendEntryCore): TrendEntryFormFields {
  return {
    titulo: entry.titulo,
    prioridad_semana: entry.prioridad_semana,
    explicacion: entry.explicacion,
    evitar: entry.evitar,
    ejemplo_referencia: entry.ejemplo_referencia,
    hook_type: entry.hook_type,
    estructura: [...entry.estructura],
    guion_hints: [...entry.guion_hints],
    editing_hints: entry.editing_hints ? [...entry.editing_hints] : undefined,
    duracion_ideal_seg: { ...entry.duracion_ideal_seg },
    modalidades_recomendadas: [...entry.modalidades_recomendadas],
    rubros: [...entry.rubros],
    formatos_playbook_compatibles: [...entry.formatos_playbook_compatibles],
  };
}

function trimFields(fields: TrendEntryFormFields): TrendEntryFormFields {
  const editingHints = (fields.editing_hints ?? [])
    .map((item) => item.trim())
    .filter(Boolean);

  const next: TrendEntryFormFields = {
    titulo: fields.titulo.trim(),
    prioridad_semana: fields.prioridad_semana,
    explicacion: fields.explicacion.trim(),
    hook_type: fields.hook_type,
    estructura: fields.estructura.map((item) => item.trim()).filter(Boolean),
    guion_hints: fields.guion_hints.map((item) => item.trim()).filter(Boolean),
    duracion_ideal_seg: fields.duracion_ideal_seg,
    modalidades_recomendadas: fields.modalidades_recomendadas,
    rubros: fields.rubros,
    formatos_playbook_compatibles: fields.formatos_playbook_compatibles,
  };

  const evitar = fields.evitar?.trim();
  if (evitar) {
    next.evitar = evitar;
  }

  const ejemplo = fields.ejemplo_referencia?.trim();
  if (ejemplo) {
    next.ejemplo_referencia = ejemplo;
  }

  if (editingHints.length > 0) {
    next.editing_hints = editingHints;
  }

  return next;
}

function slugValid(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 64;
}

export function TrendEntryForm(props: TrendEntryFormProps) {
  const router = useRouter();
  const { copy, weekStart, playbookOptions } = props;

  const isEdit = props.mode === "edit";
  const inactive = isEdit && !props.initial.activo;

  const [slug, setSlug] = useState(isEdit ? props.initial.slug : "");
  const [fields, setFields] = useState<TrendEntryFormFields>(
    isEdit ? entryToFormFields(props.initial) : emptyTrendEntryFields(),
  );
  const [editingHintsEnabled, setEditingHintsEnabled] = useState(
    isEdit ? (props.initial.editing_hints?.length ?? 0) > 0 : false,
  );
  const [evitarEnabled, setEvitarEnabled] = useState(
    isEdit ? Boolean(props.initial.evitar) : false,
  );
  const [pending, setPending] = useState(false);
  const [deactivatePending, setDeactivatePending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);

  const hookOptions = PLAYBOOK_HOOK_TYPES.map((value) => ({
    label: copy.hookTypes[value],
    value,
  }));

  const rubroOptions = PLAYBOOK_RUBROS.map((value) => ({
    label: copy.rubros[value],
    value,
  }));

  const modalityOptions = MODALITY_ORDER.map((value) => ({
    label: copy.modalities[value],
    value,
  }));

  const formatoOptions = playbookOptions.map((option) => ({
    label: `${option.titulo} (${option.slug})`,
    value: option.slug,
  }));

  const prioridadOptions = PRIORIDAD_OPTIONS.map((value) => ({
    label: String(value),
    value: String(value),
  }));

  function messageForCode(code: TrendErrorCode, messageKey?: string): string {
    if (messageKey === "trend.errors.notFound") {
      return copy.errors.notFound;
    }
    if (messageKey === "trend.errors.duplicateSlug") {
      return copy.errors.duplicateSlug;
    }
    if (messageKey === "trend.errors.invalidPlaybookSlug") {
      return copy.errors.invalidPlaybookSlug;
    }
    if (messageKey === "trend.errors.weekStartMismatch") {
      return copy.errors.weekStartMismatch;
    }

    switch (code) {
      case "VALIDATION_ERROR":
        return copy.errors.validation;
      case "FORBIDDEN_FIELDS":
        return copy.errors.forbiddenFields;
      case "DUPLICATE_SLUG":
        return copy.errors.duplicateSlug;
      case "WEEK_START_MISMATCH":
        return copy.errors.weekStartMismatch;
      case "NOT_FOUND":
        return copy.errors.notFound;
      case "UNAUTHENTICATED":
        return copy.errors.unauthenticated;
      case "FORBIDDEN":
        return copy.errors.forbidden;
      default:
        return copy.errors.internal;
    }
  }

  function validateClient(): string | null {
    if (!isEdit) {
      const trimmedSlug = slug.trim().toLowerCase();
      if (!trimmedSlug) {
        return copy.errors.slugRequired;
      }
      if (!slugValid(trimmedSlug)) {
        return copy.errors.slugFormat;
      }
    }

    const trimmed = trimFields({
      ...fields,
      evitar: evitarEnabled ? fields.evitar ?? "" : undefined,
      editing_hints: editingHintsEnabled ? fields.editing_hints ?? [""] : undefined,
    });

    if (!trimmed.titulo || !trimmed.explicacion) {
      return copy.errors.validation;
    }
    if (trimmed.estructura.length === 0 || trimmed.guion_hints.length === 0) {
      return copy.errors.validation;
    }
    if (trimmed.formatos_playbook_compatibles.length === 0) {
      return copy.errors.formatosRequired;
    }

    return null;
  }

  async function handleSubmit() {
    if (pending || inactive) {
      return;
    }

    const clientError = validateClient();
    if (clientError) {
      setBanner(clientError);
      return;
    }

    setPending(true);
    setBanner(null);

    const normalized = trimFields({
      ...fields,
      evitar: evitarEnabled ? fields.evitar ?? "" : undefined,
      editing_hints: editingHintsEnabled ? fields.editing_hints ?? [""] : undefined,
    });

    try {
      if (!isEdit) {
        const result = await addTrendEntry({
          weekStart,
          entry: {
            slug: slug.trim().toLowerCase(),
            week_start: weekStart,
            ...normalized,
          },
        });

        if (result.ok) {
          toast.success(copy.toastCreateSuccess, { duration: 4000 });
          router.push(`/operator/trends/${weekStart}/${result.slug}`);
          router.refresh();
          return;
        }

        setBanner(messageForCode(result.error.code, result.error.messageKey));
        return;
      }

      const result = await updateTrendEntry(weekStart, props.initial.slug, {
        week_start: weekStart,
        ...normalized,
      });

      if (result.ok) {
        toast.success(copy.toastSaveSuccess, { duration: 4000 });
        router.refresh();
        return;
      }

      setBanner(messageForCode(result.error.code, result.error.messageKey));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(false);
    }
  }

  function openDeactivateConfirm() {
    if (inactive || deactivatePending || !isEdit) {
      return;
    }

    setConfirmDeactivateOpen(true);
  }

  async function handleDeactivate() {
    if (!isEdit || inactive || deactivatePending) {
      return;
    }

    setDeactivatePending(true);
    setBanner(null);

    try {
      const result = await deactivateTrendEntry(weekStart, props.initial.slug);

      if (result.ok) {
        toast.success(copy.toastDeactivateSuccess, { duration: 4000 });
        router.push(`/operator/trends/${weekStart}`);
        router.refresh();
        return;
      }

      setBanner(messageForCode(result.error.code, result.error.messageKey));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setDeactivatePending(false);
    }
  }

  const title = isEdit ? copy.editTitle : copy.createTitle;

  return (
    <div className="mx-auto max-w-[820px]">
      <ConfirmDialog
        open={confirmDeactivateOpen}
        onOpenChange={setConfirmDeactivateOpen}
        header={copy.confirmDeactivate.header}
        message={copy.confirmDeactivate.message}
        acceptLabel={copy.confirmDeactivate.accept}
        rejectLabel={copy.confirmDeactivate.reject}
        destructive
        onAccept={() => {
          void handleDeactivate();
        }}
      />

      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-2 font-display text-4xl text-fog">{title}</h1>
            <p className="text-dim">{copy.subtitle}</p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/operator/trends/${weekStart}`}>{copy.backWeek}</Link>
          </Button>
        </div>

        {isEdit ? (
          <div className="mt-4">
            <StatusBadge
              severity={inactive ? "secondary" : "success"}
              value={props.initial.slug}
            />
          </div>
        ) : null}
      </div>

      {inactive ? (
        <StatusAlert
          severity="warn"
          text={copy.inactiveBanner}
          className="mb-4 w-full"
        />
      ) : null}

      {banner ? (
        <StatusAlert severity="error" text={banner} className="mb-4 w-full" />
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        className="flex flex-col gap-5"
      >
        {!isEdit ? (
          <div>
          <Label htmlFor="trend-slug" className="block font-semibold text-fog">
            {copy.fields.slug}
          </Label>
          <p className="mt-1 mb-2 text-[0.9rem] text-dim">{copy.fields.slugHint}</p>
            <Input
              id="trend-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              disabled={pending}
              className="w-full"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trend-titulo" className="block font-semibold text-fog">
            {copy.fields.titulo}
          </Label>
          <Input
            id="trend-titulo"
            value={fields.titulo}
            onChange={(event) =>
              setFields((current) => ({ ...current, titulo: event.target.value }))
            }
            disabled={pending || inactive}
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trend-prioridad" className="block font-semibold text-fog">
            {copy.fields.prioridadSemana}
          </Label>
          <SimpleSelect
            id="trend-prioridad"
            value={String(fields.prioridad_semana)}
            options={prioridadOptions}
            onChange={(value) =>
              setFields((current) => ({
                ...current,
                prioridad_semana: Number(value),
              }))
            }
            disabled={pending || inactive}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trend-explicacion" className="block font-semibold text-fog">
            {copy.fields.explicacion}
          </Label>
          <Textarea
            id="trend-explicacion"
            value={fields.explicacion}
            onChange={(event) =>
              setFields((current) => ({
                ...current,
                explicacion: event.target.value,
              }))
            }
            disabled={pending || inactive}
            rows={4}
            className="w-full"
          />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="trend-evitar-enabled"
              checked={evitarEnabled}
              onCheckedChange={(checked) => {
                const enabled = checked === true;
                setEvitarEnabled(enabled);
                if (enabled && !fields.evitar) {
                  setFields((current) => ({ ...current, evitar: "" }));
                }
              }}
              disabled={pending || inactive}
            />
            <Label htmlFor="trend-evitar-enabled" className="font-semibold text-fog">
              {copy.fields.evitar}
            </Label>
          </div>
          {evitarEnabled ? (
            <>
              <p className="mt-1 mb-2 text-[0.9rem] text-dim">
                {copy.fields.evitarHint}
              </p>
              <Textarea
                id="trend-evitar"
                value={fields.evitar ?? ""}
                onChange={(event) =>
                  setFields((current) => ({
                    ...current,
                    evitar: event.target.value,
                  }))
                }
                disabled={pending || inactive}
                rows={3}
                className="w-full"
              />
            </>
          ) : null}
        </div>

        <StringListEditor
          idPrefix="trend-estructura"
          label={copy.fields.estructura}
          hint={copy.fields.estructuraHint}
          items={fields.estructura}
          onChange={(estructura) =>
            setFields((current) => ({ ...current, estructura }))
          }
          addLabel={copy.list.addItem}
          removeLabel={copy.list.removeItem}
          placeholder={copy.list.beatPlaceholder}
          disabled={pending || inactive}
          minItems={1}
          maxItems={12}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trend-hook-type" className="block font-semibold text-fog">
            {copy.fields.hookType}
          </Label>
          <SimpleSelect
            id="trend-hook-type"
            value={fields.hook_type}
            options={hookOptions}
            onChange={(value) =>
              setFields((current) => ({ ...current, hook_type: value }))
            }
            disabled={pending || inactive}
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trend-cold-open" className="block font-semibold text-fog">
              {copy.fields.duracionColdOpen}
            </Label>
            <NumberInput
              id="trend-cold-open"
              value={fields.duracion_ideal_seg.cold_open}
              onValueChange={(cold_open) =>
                setFields((current) => ({
                  ...current,
                  duracion_ideal_seg: { ...current.duracion_ideal_seg, cold_open },
                }))
              }
              min={1}
              max={10}
              fallback={2}
              suffix="s"
              disabled={pending || inactive}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trend-duracion-total" className="block font-semibold text-fog">
              {copy.fields.duracionTotal}
            </Label>
            <NumberInput
              id="trend-duracion-total"
              value={fields.duracion_ideal_seg.total}
              onValueChange={(total) =>
                setFields((current) => ({
                  ...current,
                  duracion_ideal_seg: { ...current.duracion_ideal_seg, total },
                }))
              }
              min={5}
              max={90}
              fallback={25}
              suffix="s"
              disabled={pending || inactive}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trend-modalidades" className="block font-semibold text-fog">
            {copy.fields.modalidades}
          </Label>
          <p className="mt-1 mb-2 text-[0.9rem] text-dim">{copy.fields.modalidadesHint}</p>
          <MultiSelect
            id="trend-modalidades"
            value={fields.modalidades_recomendadas}
            options={modalityOptions}
            onChange={(value) =>
              setFields((current) => ({ ...current, modalidades_recomendadas: value }))
            }
            disabled={pending || inactive}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trend-rubros" className="block font-semibold text-fog">
            {copy.fields.rubros}
          </Label>
          <p className="mt-1 mb-2 text-[0.9rem] text-dim">{copy.fields.rubrosHint}</p>
          <MultiSelect
            id="trend-rubros"
            value={fields.rubros}
            options={rubroOptions}
            onChange={(value) =>
              setFields((current) => ({ ...current, rubros: value }))
            }
            disabled={pending || inactive}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trend-formatos" className="block font-semibold text-fog">
            {copy.fields.formatosPlaybook}
          </Label>
          <p className="mt-1 mb-2 text-[0.9rem] text-dim">{copy.fields.formatosPlaybookHint}</p>
          <MultiSelect
            id="trend-formatos"
            value={fields.formatos_playbook_compatibles}
            options={formatoOptions}
            onChange={(value) =>
              setFields((current) => ({ ...current, formatos_playbook_compatibles: value }))
            }
            disabled={pending || inactive || formatoOptions.length === 0}
          />
        </div>

        <StringListEditor
          idPrefix="trend-guion-hints"
          label={copy.fields.guionHints}
          hint={copy.fields.guionHintsHint}
          items={fields.guion_hints}
          onChange={(guion_hints) =>
            setFields((current) => ({ ...current, guion_hints }))
          }
          addLabel={copy.list.addItem}
          removeLabel={copy.list.removeItem}
          placeholder={copy.list.hintPlaceholder}
          disabled={pending || inactive}
          minItems={1}
          maxItems={20}
        />

        <div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="trend-editing-hints-enabled"
              checked={editingHintsEnabled}
              onCheckedChange={(checked) => {
                const enabled = checked === true;
                setEditingHintsEnabled(enabled);
                if (enabled && !fields.editing_hints?.length) {
                  setFields((current) => ({
                    ...current,
                    editing_hints: [""],
                  }));
                }
              }}
              disabled={pending || inactive}
            />
            <Label
              htmlFor="trend-editing-hints-enabled"
              className="font-semibold text-fog"
            >
              {copy.fields.editingHints}
            </Label>
          </div>
          {editingHintsEnabled ? (
            <div className="mt-3">
              <StringListEditor
                idPrefix="trend-editing-hints"
                label={copy.fields.editingHints}
                hint={copy.fields.editingHintsHint}
                items={fields.editing_hints ?? [""]}
                onChange={(editing_hints) =>
                  setFields((current) => ({ ...current, editing_hints }))
                }
                addLabel={copy.list.addItem}
                removeLabel={copy.list.removeItem}
                placeholder={copy.list.editingHintPlaceholder}
                disabled={pending || inactive}
                minItems={1}
                maxItems={15}
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trend-ejemplo" className="block font-semibold text-fog">
            {copy.fields.ejemploReferencia}
          </Label>
          <p className="mt-1 mb-2 text-[0.9rem] text-dim">{copy.fields.ejemploReferenciaHint}</p>
          <Textarea
            id="trend-ejemplo"
            value={fields.ejemplo_referencia ?? ""}
            onChange={(event) =>
              setFields((current) => ({
                ...current,
                ejemplo_referencia: event.target.value,
              }))
            }
            disabled={pending || inactive}
            rows={3}
            className="w-full"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-3">
          {!inactive ? (
            <Button type="submit" disabled={pending || deactivatePending}>
              {pending ? <Spinner className="size-4 text-current" /> : null}
              {isEdit ? copy.save : copy.create}
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link
              href={`/operator/trends/${weekStart}`}
              aria-disabled={pending || deactivatePending}
              tabIndex={pending || deactivatePending ? -1 : undefined}
              className={
                pending || deactivatePending ? "pointer-events-none opacity-50" : undefined
              }
            >
              {copy.cancel}
            </Link>
          </Button>
          {isEdit && !inactive ? (
            <Button
              type="button"
              variant="outline"
              className="ml-auto border-rose/60 text-rose hover:bg-rose/10 hover:text-rose"
              disabled={pending || deactivatePending}
              onClick={openDeactivateConfirm}
            >
              {deactivatePending ? <Spinner className="size-4 text-current" /> : null}
              {copy.deactivate}
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
