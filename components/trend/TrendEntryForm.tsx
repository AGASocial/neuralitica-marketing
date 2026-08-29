"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Message } from "primereact/message";
import { MultiSelect } from "primereact/multiselect";
import { Tag } from "primereact/tag";
import { Toast } from "primereact/toast";

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
  const toastRef = useRef<Toast>(null);
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
    value,
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
          toastRef.current?.show({
            severity: "success",
            summary: copy.toastCreateSuccess,
            life: 4000,
          });
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
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastSaveSuccess,
          life: 4000,
        });
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

    confirmDialog({
      header: copy.confirmDeactivate.header,
      message: copy.confirmDeactivate.message,
      icon: "pi pi-exclamation-triangle",
      acceptLabel: copy.confirmDeactivate.accept,
      rejectLabel: copy.confirmDeactivate.reject,
      acceptClassName: "p-button-danger",
      accept: () => {
        void handleDeactivate();
      },
    });
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
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastDeactivateSuccess,
          life: 4000,
        });
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
    <div style={{ maxWidth: "820px", margin: "0 auto" }}>
      <ConfirmDialog />
      <Toast ref={toastRef} />

      <div style={{ marginBottom: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: "0 0 0.5rem", fontSize: "2rem" }}>{title}</h1>
            <p style={{ margin: 0, color: "#4b5563" }}>{copy.subtitle}</p>
          </div>
          <Link
            href={`/operator/trends/${weekStart}`}
            style={{ textDecoration: "none" }}
          >
            <Button type="button" label={copy.backWeek} severity="secondary" outlined />
          </Link>
        </div>

        {isEdit ? (
          <div style={{ marginTop: "1rem" }}>
            <Tag
              severity={inactive ? "secondary" : "success"}
              value={props.initial.slug}
            />
          </div>
        ) : null}
      </div>

      {inactive ? (
        <Message
          severity="warn"
          text={copy.inactiveBanner}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
      ) : null}

      {banner ? (
        <Message
          severity="error"
          text={banner}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
      >
        {!isEdit ? (
          <div>
            <label htmlFor="trend-slug" style={{ display: "block", fontWeight: 600 }}>
              {copy.fields.slug}
            </label>
            <p style={{ margin: "0.25rem 0 0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
              {copy.fields.slugHint}
            </p>
            <InputText
              id="trend-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              disabled={pending}
              style={{ width: "100%" }}
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="trend-titulo" style={{ display: "block", fontWeight: 600 }}>
            {copy.fields.titulo}
          </label>
          <InputText
            id="trend-titulo"
            value={fields.titulo}
            onChange={(event) =>
              setFields((current) => ({ ...current, titulo: event.target.value }))
            }
            disabled={pending || inactive}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label
            htmlFor="trend-prioridad"
            style={{ display: "block", fontWeight: 600 }}
          >
            {copy.fields.prioridadSemana}
          </label>
          <Dropdown
            inputId="trend-prioridad"
            value={fields.prioridad_semana}
            options={prioridadOptions}
            onChange={(event) =>
              setFields((current) => ({
                ...current,
                prioridad_semana: event.value as number,
              }))
            }
            disabled={pending || inactive}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label
            htmlFor="trend-explicacion"
            style={{ display: "block", fontWeight: 600 }}
          >
            {copy.fields.explicacion}
          </label>
          <InputTextarea
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
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={evitarEnabled}
              onChange={(event) => {
                const enabled = event.target.checked;
                setEvitarEnabled(enabled);
                if (enabled && !fields.evitar) {
                  setFields((current) => ({ ...current, evitar: "" }));
                }
              }}
              disabled={pending || inactive}
            />
            <span style={{ fontWeight: 600 }}>{copy.fields.evitar}</span>
          </label>
          {evitarEnabled ? (
            <>
              <p
                style={{
                  margin: "0.25rem 0 0.5rem",
                  color: "#6b7280",
                  fontSize: "0.9rem",
                }}
              >
                {copy.fields.evitarHint}
              </p>
              <InputTextarea
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
                style={{ width: "100%" }}
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

        <div>
          <label htmlFor="trend-hook-type" style={{ display: "block", fontWeight: 600 }}>
            {copy.fields.hookType}
          </label>
          <Dropdown
            inputId="trend-hook-type"
            value={fields.hook_type}
            options={hookOptions}
            onChange={(event) =>
              setFields((current) => ({
                ...current,
                hook_type: event.value as PlaybookHookType,
              }))
            }
            disabled={pending || inactive}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <label
              htmlFor="trend-cold-open"
              style={{ display: "block", fontWeight: 600 }}
            >
              {copy.fields.duracionColdOpen}
            </label>
            <InputNumber
              inputId="trend-cold-open"
              value={fields.duracion_ideal_seg.cold_open}
              onValueChange={(event) =>
                setFields((current) => ({
                  ...current,
                  duracion_ideal_seg: {
                    ...current.duracion_ideal_seg,
                    cold_open: event.value ?? 2,
                  },
                }))
              }
              min={1}
              max={10}
              suffix=" s"
              disabled={pending || inactive}
            />
          </div>
          <div>
            <label
              htmlFor="trend-duracion-total"
              style={{ display: "block", fontWeight: 600 }}
            >
              {copy.fields.duracionTotal}
            </label>
            <InputNumber
              inputId="trend-duracion-total"
              value={fields.duracion_ideal_seg.total}
              onValueChange={(event) =>
                setFields((current) => ({
                  ...current,
                  duracion_ideal_seg: {
                    ...current.duracion_ideal_seg,
                    total: event.value ?? 25,
                  },
                }))
              }
              min={5}
              max={90}
              suffix=" s"
              disabled={pending || inactive}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="trend-modalidades"
            style={{ display: "block", fontWeight: 600 }}
          >
            {copy.fields.modalidades}
          </label>
          <p style={{ margin: "0.25rem 0 0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
            {copy.fields.modalidadesHint}
          </p>
          <MultiSelect
            inputId="trend-modalidades"
            value={fields.modalidades_recomendadas}
            options={modalityOptions}
            onChange={(event) =>
              setFields((current) => ({
                ...current,
                modalidades_recomendadas: event.value as VisualModality[],
              }))
            }
            disabled={pending || inactive}
            display="chip"
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label htmlFor="trend-rubros" style={{ display: "block", fontWeight: 600 }}>
            {copy.fields.rubros}
          </label>
          <p style={{ margin: "0.25rem 0 0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
            {copy.fields.rubrosHint}
          </p>
          <MultiSelect
            inputId="trend-rubros"
            value={fields.rubros}
            options={rubroOptions}
            onChange={(event) =>
              setFields((current) => ({
                ...current,
                rubros: event.value as PlaybookRubro[],
              }))
            }
            disabled={pending || inactive}
            display="chip"
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label
            htmlFor="trend-formatos"
            style={{ display: "block", fontWeight: 600 }}
          >
            {copy.fields.formatosPlaybook}
          </label>
          <p style={{ margin: "0.25rem 0 0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
            {copy.fields.formatosPlaybookHint}
          </p>
          <MultiSelect
            inputId="trend-formatos"
            value={fields.formatos_playbook_compatibles}
            options={formatoOptions}
            onChange={(event) =>
              setFields((current) => ({
                ...current,
                formatos_playbook_compatibles: event.value as string[],
              }))
            }
            disabled={pending || inactive || formatoOptions.length === 0}
            display="chip"
            style={{ width: "100%" }}
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
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={editingHintsEnabled}
              onChange={(event) => {
                const enabled = event.target.checked;
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
            <span style={{ fontWeight: 600 }}>{copy.fields.editingHints}</span>
          </label>
          {editingHintsEnabled ? (
            <div style={{ marginTop: "0.75rem" }}>
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

        <div>
          <label
            htmlFor="trend-ejemplo"
            style={{ display: "block", fontWeight: 600 }}
          >
            {copy.fields.ejemploReferencia}
          </label>
          <p style={{ margin: "0.25rem 0 0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
            {copy.fields.ejemploReferenciaHint}
          </p>
          <InputTextarea
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
            style={{ width: "100%" }}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            marginTop: "0.5rem",
          }}
        >
          {!inactive ? (
            <Button
              type="submit"
              label={isEdit ? copy.save : copy.create}
              loading={pending}
              disabled={deactivatePending}
            />
          ) : null}
          <Link
            href={`/operator/trends/${weekStart}`}
            style={{ textDecoration: "none" }}
          >
            <Button
              type="button"
              label={copy.cancel}
              severity="secondary"
              outlined
              disabled={pending || deactivatePending}
            />
          </Link>
          {isEdit && !inactive ? (
            <Button
              type="button"
              label={copy.deactivate}
              severity="danger"
              outlined
              loading={deactivatePending}
              disabled={pending}
              onClick={openDeactivateConfirm}
              style={{ marginLeft: "auto" }}
            />
          ) : null}
        </div>
      </form>
    </div>
  );
}
