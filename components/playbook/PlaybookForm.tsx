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
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);

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
          toast.success(copy.toastCreateSuccess, { duration: 4000 });
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
        toast.success(copy.toastSaveSuccess, { duration: 4000 });
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

    setConfirmArchiveOpen(true);
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
        toast.success(copy.toastArchiveSuccess, { duration: 4000 });
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
    <div className="mx-auto max-w-[820px]">
      <ConfirmDialog
        open={confirmArchiveOpen}
        onOpenChange={setConfirmArchiveOpen}
        header={copy.confirmArchive.header}
        message={copy.confirmArchive.message}
        acceptLabel={copy.confirmArchive.accept}
        rejectLabel={copy.confirmArchive.reject}
        destructive
        onAccept={() => {
          void handleArchive();
        }}
      />

      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-2 font-display text-4xl text-fog">{title}</h1>
            <p className="text-dim">{copy.subtitle}</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/operator/playbook">{copy.backList}</Link>
          </Button>
        </div>

        {isEdit ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusBadge
              severity={archived ? "secondary" : "success"}
              value={props.initial.slug}
            />
            <span className="text-[0.95rem] text-dim">
              {copy.versionLabel.replace("{version}", String(version))}
            </span>
          </div>
        ) : null}
      </div>

      {archived ? (
        <StatusAlert
          severity="warn"
          text={copy.archivedBanner}
          className="mb-4 w-full"
        />
      ) : null}

      {versionConflict ? (
        <StatusAlert severity="warn" className="mb-4 w-full">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span>{copy.versionConflict}</span>
            <Button type="button" size="sm" onClick={handleReload}>
              {copy.reload}
            </Button>
          </div>
        </StatusAlert>
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
          <Label htmlFor="playbook-slug" className="block font-semibold text-fog">
            {copy.fields.slug}
          </Label>
          <p className="mt-1 mb-2 text-[0.9rem] text-dim">{copy.fields.slugHint}</p>
            <Input
              id="playbook-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              disabled={pending}
              className="w-full"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="playbook-titulo" className="block font-semibold text-fog">
            {copy.fields.titulo}
          </Label>
          <Input
            id="playbook-titulo"
            value={payload.titulo}
            onChange={(event) =>
              setPayload((current) => ({ ...current, titulo: event.target.value }))
            }
            disabled={pending || archived}
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="playbook-explicacion" className="block font-semibold text-fog">
            {copy.fields.explicacion}
          </Label>
          <Textarea
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
            className="w-full"
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="playbook-hook-type" className="block font-semibold text-fog">
            {copy.fields.hookType}
          </Label>
          <SimpleSelect
            id="playbook-hook-type"
            value={payload.hook_type}
            options={hookOptions}
            onChange={(value) =>
              setPayload((current) => ({ ...current, hook_type: value }))
            }
            disabled={pending || archived}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="playbook-duracion" className="block font-semibold text-fog">
            {copy.fields.duracionIdealSeg}
          </Label>
          <NumberInput
            id="playbook-duracion"
            value={payload.duracion_ideal_seg}
            onValueChange={(duracion_ideal_seg) =>
              setPayload((current) => ({ ...current, duracion_ideal_seg }))
            }
            min={5}
            max={90}
            fallback={30}
            suffix="s"
            disabled={pending || archived}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="playbook-modalidades" className="block font-semibold text-fog">
            {copy.fields.modalidades}
          </Label>
          <p className="mt-1 mb-2 text-[0.9rem] text-dim">{copy.fields.modalidadesHint}</p>
          <MultiSelect
            id="playbook-modalidades"
            value={payload.modalidades_recomendadas}
            options={modalityOptions}
            onChange={(value) =>
              setPayload((current) => ({
                ...current,
                modalidades_recomendadas: value,
              }))
            }
            disabled={pending || archived}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="playbook-rubros" className="block font-semibold text-fog">
            {copy.fields.rubros}
          </Label>
          <p className="mt-1 mb-2 text-[0.9rem] text-dim">{copy.fields.rubrosHint}</p>
          <MultiSelect
            id="playbook-rubros"
            value={payload.rubros}
            options={rubroOptions}
            onChange={(value) =>
              setPayload((current) => ({ ...current, rubros: value }))
            }
            disabled={pending || archived}
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
          <div className="flex items-center gap-2">
            <Checkbox
              id="playbook-editing-hints-enabled"
              checked={editingHintsEnabled}
              onCheckedChange={(checked) => {
                const enabled = checked === true;
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
            <Label
              htmlFor="playbook-editing-hints-enabled"
              className="font-semibold text-fog"
            >
              {copy.fields.editingHints}
            </Label>
          </div>
          {editingHintsEnabled ? (
            <div className="mt-3">
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="playbook-cta" className="block font-semibold text-fog">
            {copy.fields.ctaTipo}
          </Label>
          <SimpleSelect
            id="playbook-cta"
            value={payload.cta_tipo}
            options={ctaOptions}
            onChange={(value) =>
              setPayload((current) => ({ ...current, cta_tipo: value }))
            }
            disabled={pending || archived}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="playbook-ejemplo" className="block font-semibold text-fog">
            {copy.fields.ejemploReferencia}
          </Label>
          <p className="mt-1 mb-2 text-[0.9rem] text-dim">{copy.fields.ejemploReferenciaHint}</p>
          <Textarea
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
            className="w-full"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-3">
          {!archived ? (
            <Button type="submit" disabled={pending || archivePending}>
              {pending ? <Spinner className="size-4 text-current" /> : null}
              {isEdit ? copy.save : copy.create}
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link
              href="/operator/playbook"
              aria-disabled={pending || archivePending}
              tabIndex={pending || archivePending ? -1 : undefined}
              className={
                pending || archivePending ? "pointer-events-none opacity-50" : undefined
              }
            >
              {copy.cancel}
            </Link>
          </Button>
          {isEdit && !archived ? (
            <Button
              type="button"
              variant="outline"
              className="ml-auto border-rose/60 text-rose hover:bg-rose/10 hover:text-rose"
              disabled={pending || archivePending}
              onClick={openArchiveConfirm}
            >
              {archivePending ? <Spinner className="size-4 text-current" /> : null}
              {copy.archive}
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
