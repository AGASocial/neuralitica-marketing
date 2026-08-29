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
  PLAYBOOK_CTA_TIPOS,
  PLAYBOOK_HOOK_TYPES,
  PLAYBOOK_RUBROS,
  emptyPlaybookPayload,
  type PlaybookCtaTipo,
  type PlaybookErrorCode,
  type PlaybookFormatoOperatorView,
  type PlaybookHookType,
  type PlaybookPayloadCore,
  type PlaybookRubro,
} from "@/lib/contracts/playbook";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import { archivePlaybookFormato } from "@/lib/playbook/archive-playbook-formato";
import { createPlaybookFormato } from "@/lib/playbook/create-playbook-formato";
import { updatePlaybookFormato } from "@/lib/playbook/update-playbook-formato";

const MODALITY_ORDER: VisualModality[] = [
  "own_avatar",
  "generic_avatar",
  "faceless",
];

type PlaybookFormCopy = {
  createTitle: string;
  editTitle: string;
  subtitle: string;
  save: string;
  create: string;
  cancel: string;
  saving: string;
  archiving: string;
  archive: string;
  backList: string;
  toastCreateSuccess: string;
  toastSaveSuccess: string;
  toastArchiveSuccess: string;
  versionLabel: string;
  archivedBanner: string;
  versionConflict: string;
  reload: string;
  fields: {
    slug: string;
    slugHint: string;
    titulo: string;
    explicacion: string;
    estructura: string;
    estructuraHint: string;
    hookType: string;
    duracionIdealSeg: string;
    modalidades: string;
    modalidadesHint: string;
    rubros: string;
    rubrosHint: string;
    guionHints: string;
    guionHintsHint: string;
    editingHints: string;
    editingHintsHint: string;
    ctaTipo: string;
    ejemploReferencia: string;
    ejemploReferenciaHint: string;
  };
  hookTypes: Record<PlaybookHookType, string>;
  ctaTipos: Record<PlaybookCtaTipo, string>;
  rubros: Record<PlaybookRubro, string>;
  modalities: Record<VisualModality, string>;
  list: {
    addItem: string;
    removeItem: string;
    beatPlaceholder: string;
    hintPlaceholder: string;
    editingHintPlaceholder: string;
  };
  confirmArchive: {
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
    versionConflict: string;
    alreadyArchived: string;
    unauthenticated: string;
    forbidden: string;
    internal: string;
    slugRequired: string;
    slugFormat: string;
  };
};

type PlaybookFormProps =
  | {
      mode: "create";
      copy: PlaybookFormCopy;
    }
  | {
      mode: "edit";
      initial: PlaybookFormatoOperatorView;
      copy: PlaybookFormCopy;
      locale: string;
    };

function trimPayload(payload: PlaybookPayloadCore): PlaybookPayloadCore {
  const editingHints = (payload.editing_hints ?? [])
    .map((item) => item.trim())
    .filter(Boolean);

  const next: PlaybookPayloadCore = {
    titulo: payload.titulo.trim(),
    explicacion: payload.explicacion.trim(),
    estructura: payload.estructura.map((item) => item.trim()).filter(Boolean),
    hook_type: payload.hook_type,
    duracion_ideal_seg: payload.duracion_ideal_seg,
    modalidades_recomendadas: payload.modalidades_recomendadas,
    rubros: payload.rubros,
    guion_hints: payload.guion_hints.map((item) => item.trim()).filter(Boolean),
    cta_tipo: payload.cta_tipo,
  };

  if (editingHints.length > 0) {
    next.editing_hints = editingHints;
  }

  const ejemplo = payload.ejemplo_referencia?.trim();
  if (ejemplo) {
    next.ejemplo_referencia = ejemplo;
  }

  return next;
}

function slugValid(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 64;
}

export function PlaybookForm(props: PlaybookFormProps) {
  const router = useRouter();
  const toastRef = useRef<Toast>(null);
  const { copy } = props;

  const isEdit = props.mode === "edit";
  const archived = isEdit && !props.initial.active;

  const [slug, setSlug] = useState(isEdit ? props.initial.slug : "");
  const [version, setVersion] = useState(isEdit ? props.initial.version : 1);
  const [payload, setPayload] = useState<PlaybookPayloadCore>(
    isEdit ? structuredClone(props.initial.payload) : emptyPlaybookPayload(),
  );
  const [editingHintsEnabled, setEditingHintsEnabled] = useState(
    isEdit ? (props.initial.payload.editing_hints?.length ?? 0) > 0 : false,
  );
  const [pending, setPending] = useState(false);
  const [archivePending, setArchivePending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [versionConflict, setVersionConflict] = useState(false);

  const hookOptions = PLAYBOOK_HOOK_TYPES.map((value) => ({
    label: copy.hookTypes[value],
    value,
  }));

  const ctaOptions = PLAYBOOK_CTA_TIPOS.map((value) => ({
    label: copy.ctaTipos[value],
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

  function messageForCode(code: PlaybookErrorCode, messageKey?: string): string {
    if (messageKey === "playbook.errors.notFound") {
      return copy.errors.notFound;
    }
    if (messageKey === "playbook.errors.duplicateSlug") {
      return copy.errors.duplicateSlug;
    }
    if (messageKey === "playbook.errors.versionConflict") {
      return copy.errors.versionConflict;
    }
    if (messageKey === "playbook.errors.alreadyArchived") {
      return copy.errors.alreadyArchived;
    }

    switch (code) {
      case "VALIDATION_ERROR":
        return copy.errors.validation;
      case "FORBIDDEN_FIELDS":
        return copy.errors.forbiddenFields;
      case "DUPLICATE_SLUG":
        return copy.errors.duplicateSlug;
      case "VERSION_CONFLICT":
        return copy.errors.versionConflict;
      case "ALREADY_ARCHIVED":
        return copy.errors.alreadyArchived;
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

    const trimmed = trimPayload({
      ...payload,
      editing_hints: editingHintsEnabled ? payload.editing_hints ?? [""] : undefined,
    });

    if (!trimmed.titulo || !trimmed.explicacion) {
      return copy.errors.validation;
    }
    if (trimmed.estructura.length === 0 || trimmed.guion_hints.length === 0) {
      return copy.errors.validation;
    }

    return null;
  }

  async function handleSubmit() {
    if (pending || archived) {
      return;
    }

    const clientError = validateClient();
    if (clientError) {
      setBanner(clientError);
      return;
    }

    setPending(true);
    setBanner(null);
    setVersionConflict(false);

    const normalized = trimPayload({
      ...payload,
      editing_hints: editingHintsEnabled ? payload.editing_hints ?? [""] : undefined,
    });

    try {
      if (!isEdit) {
        const result = await createPlaybookFormato({
          slug: slug.trim().toLowerCase(),
          payload: normalized,
        });

        if (result.ok) {
          toastRef.current?.show({
            severity: "success",
            summary: copy.toastCreateSuccess,
            life: 4000,
          });
          router.push(`/operator/playbook/${result.slug}`);
          router.refresh();
          return;
        }

        setBanner(messageForCode(result.error.code, result.error.messageKey));
        return;
      }

      const result = await updatePlaybookFormato(props.initial.slug, {
        expectedVersion: version,
        payload: normalized,
      });

      if (result.ok) {
        setVersion(result.version);
        setPayload(structuredClone(normalized));
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastSaveSuccess,
          life: 4000,
        });
        router.refresh();
        return;
      }

      if (result.error.code === "VERSION_CONFLICT") {
        setVersionConflict(true);
      }

      setBanner(messageForCode(result.error.code, result.error.messageKey));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(false);
    }
  }

  function openArchiveConfirm() {
    if (archived || archivePending) {
      return;
    }

    confirmDialog({
      header: copy.confirmArchive.header,
      message: copy.confirmArchive.message,
      icon: "pi pi-exclamation-triangle",
      acceptLabel: copy.confirmArchive.accept,
      rejectLabel: copy.confirmArchive.reject,
      acceptClassName: "p-button-danger",
      accept: () => {
        void handleArchive();
      },
    });
  }

  async function handleArchive() {
    if (!isEdit || archived || archivePending) {
      return;
    }

    setArchivePending(true);
    setBanner(null);
    setVersionConflict(false);

    try {
      const result = await archivePlaybookFormato(props.initial.slug, {
        expectedVersion: version,
      });

      if (result.ok) {
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastArchiveSuccess,
          life: 4000,
        });
        router.push("/operator/playbook");
        router.refresh();
        return;
      }

      if (result.error.code === "VERSION_CONFLICT") {
        setVersionConflict(true);
      }

      setBanner(messageForCode(result.error.code, result.error.messageKey));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setArchivePending(false);
    }
  }

  function handleReload() {
    setVersionConflict(false);
    setBanner(null);
    router.refresh();
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
          <Link href="/operator/playbook" style={{ textDecoration: "none" }}>
            <Button type="button" label={copy.backList} severity="secondary" outlined />
          </Link>
        </div>

        {isEdit ? (
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              marginTop: "1rem",
              flexWrap: "wrap",
            }}
          >
            <Tag severity={archived ? "secondary" : "success"} value={props.initial.slug} />
            <span style={{ color: "#6b7280", fontSize: "0.95rem" }}>
              {copy.versionLabel.replace("{version}", String(version))}
            </span>
          </div>
        ) : null}
      </div>

      {archived ? (
        <Message
          severity="warn"
          text={copy.archivedBanner}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
      ) : null}

      {versionConflict ? (
        <Message
          severity="warn"
          style={{ width: "100%", marginBottom: "1rem" }}
          content={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <span>{copy.versionConflict}</span>
              <Button
                type="button"
                label={copy.reload}
                size="small"
                onClick={handleReload}
              />
            </div>
          }
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
            <label htmlFor="playbook-slug" style={{ display: "block", fontWeight: 600 }}>
              {copy.fields.slug}
            </label>
            <p style={{ margin: "0.25rem 0 0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
              {copy.fields.slugHint}
            </p>
            <InputText
              id="playbook-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              disabled={pending}
              style={{ width: "100%" }}
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="playbook-titulo" style={{ display: "block", fontWeight: 600 }}>
            {copy.fields.titulo}
          </label>
          <InputText
            id="playbook-titulo"
            value={payload.titulo}
            onChange={(event) =>
              setPayload((current) => ({ ...current, titulo: event.target.value }))
            }
            disabled={pending || archived}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label
            htmlFor="playbook-explicacion"
            style={{ display: "block", fontWeight: 600 }}
          >
            {copy.fields.explicacion}
          </label>
          <InputTextarea
            id="playbook-explicacion"
            value={payload.explicacion}
            onChange={(event) =>
              setPayload((current) => ({
                ...current,
                explicacion: event.target.value,
              }))
            }
            disabled={pending || archived}
            rows={4}
            style={{ width: "100%" }}
          />
        </div>

        <StringListEditor
          idPrefix="estructura"
          label={copy.fields.estructura}
          hint={copy.fields.estructuraHint}
          items={payload.estructura}
          onChange={(estructura) =>
            setPayload((current) => ({ ...current, estructura }))
          }
          addLabel={copy.list.addItem}
          removeLabel={copy.list.removeItem}
          placeholder={copy.list.beatPlaceholder}
          disabled={pending || archived}
          minItems={1}
          maxItems={12}
        />

        <div>
          <label htmlFor="playbook-hook-type" style={{ display: "block", fontWeight: 600 }}>
            {copy.fields.hookType}
          </label>
          <Dropdown
            inputId="playbook-hook-type"
            value={payload.hook_type}
            options={hookOptions}
            onChange={(event) =>
              setPayload((current) => ({
                ...current,
                hook_type: event.value as PlaybookHookType,
              }))
            }
            disabled={pending || archived}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label
            htmlFor="playbook-duracion"
            style={{ display: "block", fontWeight: 600 }}
          >
            {copy.fields.duracionIdealSeg}
          </label>
          <InputNumber
            inputId="playbook-duracion"
            value={payload.duracion_ideal_seg}
            onValueChange={(event) =>
              setPayload((current) => ({
                ...current,
                duracion_ideal_seg: event.value ?? 30,
              }))
            }
            min={5}
            max={90}
            suffix=" s"
            disabled={pending || archived}
          />
        </div>

        <div>
          <label
            htmlFor="playbook-modalidades"
            style={{ display: "block", fontWeight: 600 }}
          >
            {copy.fields.modalidades}
          </label>
          <p style={{ margin: "0.25rem 0 0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
            {copy.fields.modalidadesHint}
          </p>
          <MultiSelect
            inputId="playbook-modalidades"
            value={payload.modalidades_recomendadas}
            options={modalityOptions}
            onChange={(event) =>
              setPayload((current) => ({
                ...current,
                modalidades_recomendadas: event.value as VisualModality[],
              }))
            }
            disabled={pending || archived}
            display="chip"
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label htmlFor="playbook-rubros" style={{ display: "block", fontWeight: 600 }}>
            {copy.fields.rubros}
          </label>
          <p style={{ margin: "0.25rem 0 0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
            {copy.fields.rubrosHint}
          </p>
          <MultiSelect
            inputId="playbook-rubros"
            value={payload.rubros}
            options={rubroOptions}
            onChange={(event) =>
              setPayload((current) => ({
                ...current,
                rubros: event.value as PlaybookRubro[],
              }))
            }
            disabled={pending || archived}
            display="chip"
            style={{ width: "100%" }}
          />
        </div>

        <StringListEditor
          idPrefix="guion-hints"
          label={copy.fields.guionHints}
          hint={copy.fields.guionHintsHint}
          items={payload.guion_hints}
          onChange={(guion_hints) =>
            setPayload((current) => ({ ...current, guion_hints }))
          }
          addLabel={copy.list.addItem}
          removeLabel={copy.list.removeItem}
          placeholder={copy.list.hintPlaceholder}
          disabled={pending || archived}
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
                if (enabled && !payload.editing_hints?.length) {
                  setPayload((current) => ({
                    ...current,
                    editing_hints: [""],
                  }));
                }
              }}
              disabled={pending || archived}
            />
            <span style={{ fontWeight: 600 }}>{copy.fields.editingHints}</span>
          </label>
          {editingHintsEnabled ? (
            <div style={{ marginTop: "0.75rem" }}>
              <StringListEditor
                idPrefix="editing-hints"
                label={copy.fields.editingHints}
                hint={copy.fields.editingHintsHint}
                items={payload.editing_hints ?? [""]}
                onChange={(editing_hints) =>
                  setPayload((current) => ({ ...current, editing_hints }))
                }
                addLabel={copy.list.addItem}
                removeLabel={copy.list.removeItem}
                placeholder={copy.list.editingHintPlaceholder}
                disabled={pending || archived}
                minItems={1}
                maxItems={15}
              />
            </div>
          ) : null}
        </div>

        <div>
          <label htmlFor="playbook-cta" style={{ display: "block", fontWeight: 600 }}>
            {copy.fields.ctaTipo}
          </label>
          <Dropdown
            inputId="playbook-cta"
            value={payload.cta_tipo}
            options={ctaOptions}
            onChange={(event) =>
              setPayload((current) => ({
                ...current,
                cta_tipo: event.value as PlaybookCtaTipo,
              }))
            }
            disabled={pending || archived}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label
            htmlFor="playbook-ejemplo"
            style={{ display: "block", fontWeight: 600 }}
          >
            {copy.fields.ejemploReferencia}
          </label>
          <p style={{ margin: "0.25rem 0 0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
            {copy.fields.ejemploReferenciaHint}
          </p>
          <InputTextarea
            id="playbook-ejemplo"
            value={payload.ejemplo_referencia ?? ""}
            onChange={(event) =>
              setPayload((current) => ({
                ...current,
                ejemplo_referencia: event.target.value,
              }))
            }
            disabled={pending || archived}
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
          {!archived ? (
            <Button
              type="submit"
              label={isEdit ? copy.save : copy.create}
              loading={pending}
              disabled={archivePending}
            />
          ) : null}
          <Link href="/operator/playbook" style={{ textDecoration: "none" }}>
            <Button
              type="button"
              label={copy.cancel}
              severity="secondary"
              outlined
              disabled={pending || archivePending}
            />
          </Link>
          {isEdit && !archived ? (
            <Button
              type="button"
              label={copy.archive}
              severity="danger"
              outlined
              loading={archivePending}
              disabled={pending}
              onClick={openArchiveConfirm}
              style={{ marginLeft: "auto" }}
            />
          ) : null}
        </div>
      </form>
    </div>
  );
}
