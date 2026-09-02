/**
 * US-3.3 Avatar reference media — validator, storage, actions, helper, serve.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Module from "node:module";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { isPublicPath } from "../auth/public-routes";
import {
  STORAGE_KEY_REGEX,
  avatarReferenceAssetItemSchema,
  avatarReferenceAssetsForClientSchema,
  deleteAvatarReferenceAssetInputSchema,
  uploadAvatarReferenceAssetSuccessSchema,
} from "../contracts/media-assets";
import {
  FORBIDDEN_MEDIA_DELETE_KEYS,
  FORBIDDEN_MEDIA_UPLOAD_FORM_KEYS,
  findForbiddenDeleteKeys,
  findForbiddenUploadFormKeys,
  mapMediaAssetRowToItem,
  sanitizeOriginalFilename,
} from "./media-helpers.ts";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const VICTIM_ID = "00000000-0000-4000-8000-000000000099";
const ASSET_ID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
const STORAGE_KEY = "a1b2c3d4-e5f6-4789-a012-3456789abcde.jpg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

// Stub server-only before any media storage / action imports.
const nodeModuleEarly = Module as unknown as NodeModuleLoad;
const originalLoadEarly = nodeModuleEarly._load.bind(Module);
nodeModuleEarly._load = function (request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }
  return originalLoadEarly(request, parent, isMain);
};

const {
  assertRootOutsidePublic,
  LocalDiskStorage,
  MediaRootUnderPublicError,
  UnsafeStorageKeyError,
} = require("./storage/local-disk-storage.ts") as typeof import("./storage/local-disk-storage");
const { S3Storage } = require("./storage/s3-storage.ts") as typeof import("./storage/s3-storage");

/** Minimal valid JPEG (magic bytes + tiny payload). */
function jpegBuffer(size = 256): Buffer {
  const buf = Buffer.alloc(size, 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf;
}

function pngBuffer(size = 256): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const buf = Buffer.alloc(size, 0);
  sig.copy(buf);
  return buf;
}

function svgBuffer(): Buffer {
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
}

function gifBuffer(): Buffer {
  return Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;");
}

function htmlBuffer(): Buffer {
  return Buffer.from("<!DOCTYPE html><html><body>x</body></html>");
}

function mp4MagicBuffer(size = 512): Buffer {
  const buf = Buffer.alloc(size, 0);
  buf.write("ftypisom", 4, "ascii");
  return buf;
}

function clearMediaModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/media/") ||
      normalized.includes("/lib/supabase/server") ||
      normalized.includes("/lib/auth/require-user") ||
      normalized.includes("/lib/contracts/media-assets") ||
      normalized.includes("/lib/visual-preferences/has-active-avatar-consent") ||
      normalized.includes("/app/api/media/")
    ) {
      delete require.cache[key];
    }
  }
}

function loadMediaModule<T = Record<string, unknown>>(relativePath: string): T {
  clearMediaModuleCache();
  // Prefer require so Module._load mocks rebind after cache clear (ESM import cache sticks).
  return require(relativePath) as T;
}

function chainableQuery(terminal: {
  maybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
  single?: () => Promise<{ data: unknown; error: unknown }>;
  count?: number | null;
}) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = self;
  builder.eq = self;
  builder.is = self;
  builder.order = self;
  builder.limit = self;
  builder.insert = self;
  builder.update = self;
  builder.upsert = self;
  builder.delete = self;
  builder.maybeSingle =
    terminal.maybeSingle ?? (async () => ({ data: null, error: null }));
  builder.single =
    terminal.single ?? (async () => ({ data: null, error: null }));
  builder.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) =>
    Promise.resolve({
      data: null,
      error: null,
      count: terminal.count ?? 0,
    }).then(onFulfilled, onRejected);
  return builder;
}

type InstallOptions = {
  requireActive?: () => Promise<unknown>;
  requireOperator?: () => Promise<unknown>;
  isAuthGuardError?: (error: unknown) => boolean;
  hasActiveAvatarConsent?: (clientId: string) => Promise<boolean>;
  from?: (table: string) => unknown;
  revalidatePath?: (p: string) => void;
  mediaRoot?: string;
  isAssetReferencedByJob?: (assetId: string) => Promise<boolean>;
};

function installMediaMocks(options: InstallOptions) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);

  if (options.mediaRoot) {
    process.env.NEURAMARK_MEDIA_ROOT = options.mediaRoot;
  }

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    if (request === "next/cache") {
      return {
        revalidatePath: options.revalidatePath ?? (() => {}),
      };
    }
    if (
      request === "@/lib/auth/require-user" ||
      String(request).includes("lib/auth/require-user")
    ) {
      return {
        isAuthGuardError:
          options.isAuthGuardError ??
          ((error: unknown) =>
            Boolean(
              error &&
                typeof error === "object" &&
                "status" in error &&
                ((error as { status: number }).status === 401 ||
                  (error as { status: number }).status === 403),
            )),
        requireActive:
          options.requireActive ??
          (async () => ({
            id: CLIENT_ID,
            email: "gaveho@gmail.com",
            displayName: "Gabriel Vega",
            preferredLocale: "en",
            role: "client",
            active: true,
          })),
        requireOperator:
          options.requireOperator ??
          (async () => ({
            id: CLIENT_ID,
            email: "gaveho@gmail.com",
            displayName: "Gabriel Vega",
            preferredLocale: "en",
            role: "operator",
            active: true,
          })),
        authGuardResponse: (error: { status: number; envelope: unknown }) =>
          Response.json(error.envelope, { status: error.status }),
      };
    }
    if (String(request).includes("has-active-avatar-consent")) {
      return {
        hasActiveAvatarConsent:
          options.hasActiveAvatarConsent ?? (async () => true),
      };
    }
    if (String(request).includes("is-asset-referenced-by-job")) {
      if (options.isAssetReferencedByJob) {
        return {
          isAvatarReferenceAssetReferencedByJob: options.isAssetReferencedByJob,
        };
      }
    }
    if (
      request === "@/lib/supabase/server" ||
      String(request).includes("lib/supabase/server")
    ) {
      return {
        isSupabaseConfigured: () => true,
        createServerSupabaseClient: () => ({
          from:
            options.from ??
            ((table: string) => {
              throw new Error(`unexpected from(${table})`);
            }),
        }),
      };
    }
    return originalLoad(request, parent, isMain);
  };

  return () => {
    nodeModule._load = originalLoad;
    delete process.env.NEURAMARK_MEDIA_ROOT;
    clearMediaModuleCache();
  };
}

describe("media contracts + helpers", () => {
  it("rejects delete input with tenant / storage keys via .strict()", () => {
    assert.equal(
      deleteAvatarReferenceAssetInputSchema.safeParse({
        assetId: ASSET_ID,
        client_id: VICTIM_ID,
      }).success,
      false,
    );
    assert.equal(
      findForbiddenDeleteKeys({ assetId: ASSET_ID, client_id: VICTIM_ID })
        .length > 0,
      true,
    );
  });

  it("accepts valid delete body", () => {
    assert.equal(
      deleteAvatarReferenceAssetInputSchema.safeParse({ assetId: ASSET_ID })
        .success,
      true,
    );
  });

  it("maps row to item without storage_key", () => {
    const item = mapMediaAssetRowToItem({
      id: ASSET_ID,
      asset_type: "avatar_reference",
      metadata: {
        originalFilename: "portrait.jpg",
        detectedMime: "image/jpeg",
        sizeBytes: 204800,
      },
      created_at: "2026-08-29T22:00:00.000Z",
    });
    assert.ok(item);
    const json = JSON.stringify(item);
    assert.equal(json.includes("storage_key"), false);
    assert.equal(json.includes("storageKey"), false);
    assert.equal(item.previewUrl, `/api/media/assets/${ASSET_ID}`);
    assert.equal(avatarReferenceAssetItemSchema.safeParse(item).success, true);
  });

  it("sanitizes path-traversal filenames for metadata only", () => {
    assert.equal(
      sanitizeOriginalFilename("../../etc/passwd"),
      ".._.._etc_passwd",
    );
    assert.ok(sanitizeOriginalFilename("a".repeat(400)).length <= 255);
  });

  it("lists forbidden FormData keys for upload", () => {
    const fd = new FormData();
    fd.append("file", new Blob([jpegBuffer()]), "x.jpg");
    fd.append("client_id", VICTIM_ID);
    assert.ok(findForbiddenUploadFormKeys(fd).includes("client_id"));
    assert.ok(FORBIDDEN_MEDIA_UPLOAD_FORM_KEYS.includes("storage_key"));
    assert.ok(FORBIDDEN_MEDIA_DELETE_KEYS.includes("asset_type"));
  });

  it("keeps serve + preferences off isPublicPath", () => {
    assert.equal(isPublicPath("/api/media/assets/" + ASSET_ID), false);
    assert.equal(isPublicPath("/api/media/assets"), false);
    assert.equal(isPublicPath("/settings/preferences"), false);
  });
});

describe("LocalDiskStorage + S3 stub", () => {
  const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-media-"));

  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects root under public/", () => {
    const publicRoot = path.join(repoRoot, "public", "uploads");
    assert.throws(
      () => assertRootOutsidePublic(publicRoot),
      MediaRootUnderPublicError,
    );
  });

  it("puts and deletes outside public/; rejects unsafe keys", async () => {
    const storage = new LocalDiskStorage(tmp);
    const key = "b2c3d4e5-f6a7-4890-b123-456789abcdef.jpg";
    assert.ok(STORAGE_KEY_REGEX.test(key));
    await storage.put(key, jpegBuffer(128), {
      contentType: "image/jpeg",
      sizeBytes: 128,
    });
    const full = path.join(tmp, key);
    assert.equal(existsSync(full), true);
    assert.ok(!full.includes(`${path.sep}public${path.sep}`));

    assert.throws(
      () => storage.assertSafeKey("../etc/passwd.jpg"),
      UnsafeStorageKeyError,
    );
    assert.throws(
      () => storage.assertSafeKey("/abs/path.jpg"),
      UnsafeStorageKeyError,
    );
    assert.throws(
      () => storage.assertSafeKey("not-a-uuid.png"),
      UnsafeStorageKeyError,
    );

    await storage.delete(key);
    assert.equal(existsSync(full), false);
  });

  it("puts client logo keys with nested neuramark/ paths", async () => {
    const storage = new LocalDiskStorage(tmp);
    const key =
      "neuramark/11111111-1111-4111-8111-111111111111/logo-a1b2c3d4-e5f6-4789-a012-3456789abcde.png";
    await storage.put(key, pngBuffer(128), {
      contentType: "image/png",
      sizeBytes: 128,
    });
    const full = path.join(tmp, key);
    assert.equal(existsSync(full), true);
    await storage.delete(key);
    assert.equal(existsSync(full), false);
  });

  it("S3Storage stub throws not configured", async () => {
    const s3 = new S3Storage();
    await assert.rejects(
      () =>
        s3.put(STORAGE_KEY, jpegBuffer(), {
          contentType: "image/jpeg",
          sizeBytes: 256,
        }),
      /not configured/,
    );
  });
});

describe("validateAndPrepareMediaUpload", () => {
  it("accepts JPEG with consent; rejects SVG/GIF/HTML/oversize/no-consent/cap", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-val-"));
    const restore = installMediaMocks({
      mediaRoot: tmp,
      hasActiveAvatarConsent: async () => true,
    });
    try {
            const { validateAndPrepareMediaUpload } = loadMediaModule("./upload-validation.ts");

      const ok = await validateAndPrepareMediaUpload({
        userId: CLIENT_ID,
        assetType: "avatar_reference",
        file: jpegBuffer(512),
        originalFilename: "portrait.jpg",
        existingAssetCount: 0,
      });
      assert.equal(ok.ok, true);
      if (ok.ok) {
        assert.equal(ok.prepared.detectedMime, "image/jpeg");
        assert.ok(STORAGE_KEY_REGEX.test(ok.prepared.storageKey));
        assert.equal(ok.prepared.metadata.originalFilename, "portrait.jpg");
      }

      const svg = await validateAndPrepareMediaUpload({
        userId: CLIENT_ID,
        assetType: "avatar_reference",
        file: svgBuffer(),
        originalFilename: "evil.svg.jpg",
        existingAssetCount: 0,
      });
      assert.equal(svg.ok, false);
      if (!svg.ok) assert.equal(svg.error.code, "INVALID_FILE_TYPE");

      const gif = await validateAndPrepareMediaUpload({
        userId: CLIENT_ID,
        assetType: "avatar_reference",
        file: gifBuffer(),
        originalFilename: "x.gif",
        existingAssetCount: 0,
      });
      assert.equal(gif.ok, false);
      if (!gif.ok) assert.equal(gif.error.code, "INVALID_FILE_TYPE");

      const html = await validateAndPrepareMediaUpload({
        userId: CLIENT_ID,
        assetType: "avatar_reference",
        file: htmlBuffer(),
        originalFilename: "x.html",
        existingAssetCount: 0,
      });
      assert.equal(html.ok, false);

      const oversize = await validateAndPrepareMediaUpload({
        userId: CLIENT_ID,
        assetType: "avatar_reference",
        file: jpegBuffer(11 * 1024 * 1024),
        originalFilename: "big.jpg",
        existingAssetCount: 0,
      });
      assert.equal(oversize.ok, false);
      if (!oversize.ok) assert.equal(oversize.error.code, "FILE_TOO_LARGE");

      const atCap = await validateAndPrepareMediaUpload({
        userId: CLIENT_ID,
        assetType: "avatar_reference",
        file: jpegBuffer(256),
        originalFilename: "x.jpg",
        existingAssetCount: 10,
      });
      assert.equal(atCap.ok, false);
      if (!atCap.ok) assert.equal(atCap.error.code, "ASSET_LIMIT_REACHED");
    } finally {
      restore();
      rmSync(tmp, { recursive: true, force: true });
    }

    const restoreNoConsent = installMediaMocks({
      hasActiveAvatarConsent: async () => false,
    });
    try {
            const { validateAndPrepareMediaUpload } = loadMediaModule("./upload-validation.ts");
      const noConsent = await validateAndPrepareMediaUpload({
        userId: CLIENT_ID,
        assetType: "avatar_reference",
        file: jpegBuffer(256),
        originalFilename: "x.jpg",
        existingAssetCount: 0,
      });
      assert.equal(noConsent.ok, false);
      if (!noConsent.ok) {
        assert.equal(noConsent.error.code, "OWN_AVATAR_CONSENT_REQUIRED");
      }
    } finally {
      restoreNoConsent();
    }
  });

  it("exports validateAndPrepareMediaUpload for US-8.3 / US-9.2 import", async () => {
    const src = readFileSync(
      path.join(__dirname, "upload-validation.ts"),
      "utf8",
    );
    assert.match(src, /export async function validateAndPrepareMediaUpload/);
    assert.match(src, /US-8\.3/);
    assert.match(src, /import "server-only"/);
  });
});

describe("hasOwnAvatarReferenceAssets", () => {
  it("returns false for empty clientId and zero rows; true when count >= 1", async () => {
    const restoreEmpty = installMediaMocks({
      from: () =>
        chainableQuery({ count: 0 }),
    });
    try {
            const { hasOwnAvatarReferenceAssets } = loadMediaModule("./has-own-avatar-reference-assets.ts");
      assert.equal(await hasOwnAvatarReferenceAssets(""), false);
      assert.equal(await hasOwnAvatarReferenceAssets(CLIENT_ID), false);
    } finally {
      restoreEmpty();
    }

    const restoreOne = installMediaMocks({
      from: () =>
        chainableQuery({ count: 1 }),
    });
    try {
            const { hasOwnAvatarReferenceAssets } = loadMediaModule("./has-own-avatar-reference-assets.ts");
      assert.equal(await hasOwnAvatarReferenceAssets(CLIENT_ID), true);
    } finally {
      restoreOne();
    }

    const src = readFileSync(
      path.join(__dirname, "has-own-avatar-reference-assets.ts"),
      "utf8",
    );
    assert.match(src, /US-8 job create MUST call/);
  });
});

describe("uploadAvatarReferenceAsset", () => {
  it("happy path writes disk + returns DTO without storage_key; rejects forbidden/unauth", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-up-"));
    let inserted: Record<string, unknown> | null = null;
    const revalidated: string[] = [];

    const restore = installMediaMocks({
      mediaRoot: tmp,
      hasActiveAvatarConsent: async () => true,
      revalidatePath: (p) => revalidated.push(p),
      from: (table: string) => {
        if (table !== "neuramark_media_assets") {
          throw new Error(`unexpected ${table}`);
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({ data: null, error: null, count: 0 }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            inserted = row;
            return {
              select: () => ({
                single: async () => ({
                  data: {
                    id: ASSET_ID,
                    asset_type: "avatar_reference",
                    storage_key: row.storage_key,
                    metadata: row.metadata,
                    created_at: "2026-08-29T22:05:00.000Z",
                  },
                  error: null,
                }),
              }),
            };
          },
        };
      },
    });

    try {
      clearMediaModuleCache();
      // reset storage singleton
      const { resetMediaStorageCacheForTests } = loadMediaModule("./storage/get-media-storage.ts");
      resetMediaStorageCacheForTests();

      const { uploadAvatarReferenceAsset } = loadMediaModule("./upload-avatar-reference-asset.ts");

      const fd = new FormData();
      fd.append(
        "file",
        new File([jpegBuffer(400)], "portrait.jpg", { type: "image/jpeg" }),
      );

      const result = await uploadAvatarReferenceAsset(fd);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(
          uploadAvatarReferenceAssetSuccessSchema.safeParse(result).success,
          true,
        );
        const json = JSON.stringify(result);
        assert.equal(json.includes("storage_key"), false);
        assert.equal(result.asset.previewUrl, `/api/media/assets/${ASSET_ID}`);
      }
      assert.ok(inserted);
      assert.equal(inserted!.client_id, CLIENT_ID);
      assert.equal(inserted!.asset_type, "avatar_reference");
      assert.ok(typeof inserted!.storage_key === "string");
      assert.ok(existsSync(path.join(tmp, String(inserted!.storage_key))));
      assert.deepEqual(revalidated, ["/settings/preferences"]);

      // forbidden fields
      const bad = new FormData();
      bad.append("file", new File([jpegBuffer(200)], "x.jpg"));
      bad.append("client_id", VICTIM_ID);
      const forbidden = await uploadAvatarReferenceAsset(bad);
      assert.equal(forbidden.ok, false);
      if (!forbidden.ok) assert.equal(forbidden.error.code, "FORBIDDEN_FIELDS");
    } finally {
      restore();
      rmSync(tmp, { recursive: true, force: true });
    }

    const restoreUnauth = installMediaMocks({
      requireActive: async () => {
        const err = new Error("unauth") as Error & {
          status: number;
          envelope: unknown;
        };
        err.status = 401;
        err.envelope = { ok: false, error: { code: "UNAUTHENTICATED" } };
        throw err;
      },
    });
    try {
            const { uploadAvatarReferenceAsset } = loadMediaModule("./upload-avatar-reference-asset.ts");
      const fd = new FormData();
      fd.append("file", new File([jpegBuffer(100)], "x.jpg"));
      const result = await uploadAvatarReferenceAsset(fd);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "UNAUTHENTICATED");
    } finally {
      restoreUnauth();
    }
  });

  it("does not enqueue jobs on upload source", () => {
    const src = readFileSync(
      path.join(__dirname, "upload-avatar-reference-asset.ts"),
      "utf8",
    );
    assert.doesNotMatch(src, /neuramark_video_jobs|\.enqueue\(/);
    assert.doesNotMatch(src, /from\("\@\/lib\/providers/);
    assert.match(src, /Never enqueues/);
  });
});

describe("deleteAvatarReferenceAsset", () => {
  it("deletes own asset from disk + DB; foreign → NOT_FOUND", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-del-"));
    const key = "c3d4e5f6-a7b8-4901-8234-56789abcdef0.jpg";
    const storage = new LocalDiskStorage(tmp);
    await storage.put(key, jpegBuffer(64), {
      contentType: "image/jpeg",
      sizeBytes: 64,
    });

    let deletedId: string | null = null;
    const restore = installMediaMocks({
      mediaRoot: tmp,
      from: (table: string) => {
        if (table === "neuramark_video_jobs") {
          return {
            select: () => ({
              or: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table !== "neuramark_media_assets") {
          throw new Error(table);
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: ASSET_ID, storage_key: key },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          delete: () => ({
            eq: (_c: string, id: string) => {
              deletedId = id;
              return {
                eq: () => ({
                  eq: () => Promise.resolve({ data: null, error: null }),
                }),
              };
            },
          }),
        };
      },
    });

    try {
            const { resetMediaStorageCacheForTests } = loadMediaModule("./storage/get-media-storage.ts");
      resetMediaStorageCacheForTests();
      const { deleteAvatarReferenceAsset } = loadMediaModule("./delete-avatar-reference-asset.ts");

      const result = await deleteAvatarReferenceAsset({ assetId: ASSET_ID });
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.deletedAssetId, ASSET_ID);
      assert.equal(existsSync(path.join(tmp, key)), false);
      assert.equal(deletedId, ASSET_ID);
    } finally {
      restore();
      rmSync(tmp, { recursive: true, force: true });
    }

    const restoreForeign = installMediaMocks({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    });
    try {
            const { deleteAvatarReferenceAsset } = loadMediaModule("./delete-avatar-reference-asset.ts");
      const result = await deleteAvatarReferenceAsset({
        assetId: "00000000-0000-4000-8000-000000000099",
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "NOT_FOUND");
    } finally {
      restoreForeign();
    }
  });
});

describe("getAvatarReferenceAssetsForClient", () => {
  it("lists own assets ASC; canUpload false when consent inactive; omits storage_key", async () => {
    const restore = installMediaMocks({
      hasActiveAvatarConsent: async () => false,
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    id: ASSET_ID,
                    asset_type: "avatar_reference",
                    metadata: {
                      originalFilename: "portrait.jpg",
                      detectedMime: "image/jpeg",
                      sizeBytes: 204800,
                    },
                    created_at: "2026-08-28T10:00:00.000Z",
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    });
    try {
            const { getAvatarReferenceAssetsForClient } = loadMediaModule("./get-avatar-reference-assets-for-client.ts");
      const result = await getAvatarReferenceAssetsForClient();
      assert.equal(
        avatarReferenceAssetsForClientSchema.safeParse(result).success,
        true,
      );
      assert.equal(result.ownAvatarConsentActive, false);
      assert.equal(result.canUpload, false);
      assert.equal(result.assets.length, 1);
      assert.equal(JSON.stringify(result).includes("storage_key"), false);
    } finally {
      restore();
    }
  });

  it("arity is 0", async () => {
    const src = readFileSync(
      path.join(__dirname, "get-avatar-reference-assets-for-client.ts"),
      "utf8",
    );
    assert.match(src, /export async function getAvatarReferenceAssetsForClient\(\)/);
  });
});

describe("GET serve route", () => {
  it("returns 404 for foreign asset; 200 with private no-store for own avatar_reference", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-serve-"));
    const key = "d4e5f6a7-b8c9-4012-8345-6789abcdef01.jpg";
    await new LocalDiskStorage(tmp).put(key, jpegBuffer(80), {
      contentType: "image/jpeg",
      sizeBytes: 80,
    });

    const restoreOwn = installMediaMocks({
      mediaRoot: tmp,
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: ASSET_ID,
                client_id: CLIENT_ID,
                asset_type: "avatar_reference",
                storage_key: key,
                metadata: {
                  originalFilename: "portrait.jpg",
                  detectedMime: "image/jpeg",
                  sizeBytes: 80,
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    });

    try {
            const { resetMediaStorageCacheForTests } = loadMediaModule("./storage/get-media-storage.ts");
      resetMediaStorageCacheForTests();
      const { GET } = loadMediaModule("../../app/api/media/assets/[assetId]/route.ts");
      const res = await GET(new Request("http://localhost/api/media/assets/" + ASSET_ID), {
        params: Promise.resolve({ assetId: ASSET_ID }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Cache-Control"), "private, no-store");
      assert.equal(res.headers.get("Content-Type"), "image/jpeg");
      assert.ok(res.body);
    } finally {
      restoreOwn();
    }

    const restoreForeign = installMediaMocks({
      mediaRoot: tmp,
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: VICTIM_ID,
                client_id: VICTIM_ID,
                asset_type: "avatar_reference",
                storage_key: key,
                metadata: {
                  originalFilename: "portrait.jpg",
                  detectedMime: "image/jpeg",
                  sizeBytes: 80,
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    });
    try {
            const { resetMediaStorageCacheForTests } = loadMediaModule("./storage/get-media-storage.ts");
      resetMediaStorageCacheForTests();
      const { GET } = loadMediaModule("../../app/api/media/assets/[assetId]/route.ts");
      const res = await GET(
        new Request("http://localhost/api/media/assets/" + VICTIM_ID),
        { params: Promise.resolve({ assetId: VICTIM_ID }) },
      );
      assert.equal(res.status, 404);
    } finally {
      restoreForeign();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("serves generated_video for operator-owned asset", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-gen-serve-"));
    const key = "e5f6a7b8-c9d0-4123-9456-789abcdef012.mp4";
    await new LocalDiskStorage(tmp).put(key, mp4MagicBuffer(80), {
      contentType: "video/mp4",
      sizeBytes: 80,
    });

    const restore = installMediaMocks({
      mediaRoot: tmp,
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: ASSET_ID,
                client_id: CLIENT_ID,
                asset_type: "generated_video",
                storage_key: key,
                metadata: {
                  originalFilename: "manual.mp4",
                  detectedMime: "video/mp4",
                  sizeBytes: 80,
                  durationSec: 5,
                  source: "manual_upload",
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    });

    try {
      const { resetMediaStorageCacheForTests } = loadMediaModule("./storage/get-media-storage.ts");
      resetMediaStorageCacheForTests();
      const { GET } = loadMediaModule("../../app/api/media/assets/[assetId]/route.ts");
      const res = await GET(new Request("http://localhost/api/media/assets/" + ASSET_ID), {
        params: Promise.resolve({ assetId: ASSET_ID }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Content-Type"), "video/mp4");
      assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    } finally {
      restore();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("US-11.1 serves assembled_reel for owning Cliente", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-assembled-serve-"));
    const key = "f6a7b8c9-d0e1-4234-9567-89abcdef0123.mp4";
    await new LocalDiskStorage(tmp).put(key, mp4MagicBuffer(80), {
      contentType: "video/mp4",
      sizeBytes: 80,
    });

    const restore = installMediaMocks({
      mediaRoot: tmp,
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: ASSET_ID,
                client_id: CLIENT_ID,
                asset_type: "assembled_reel",
                storage_key: key,
                metadata: {
                  detectedMime: "video/mp4",
                  sizeBytes: 80,
                  durationSec: 30,
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    });

    try {
      const { resetMediaStorageCacheForTests } = loadMediaModule("./storage/get-media-storage.ts");
      resetMediaStorageCacheForTests();
      const { GET } = loadMediaModule("../../app/api/media/assets/[assetId]/route.ts");
      const res = await GET(new Request("http://localhost/api/media/assets/" + ASSET_ID), {
        params: Promise.resolve({ assetId: ASSET_ID }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Cache-Control"), "private, no-store");
      assert.equal(res.headers.get("Content-Type"), "video/mp4");
    } finally {
      restore();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("US-11.1 foreign assembled_reel → 404 for Cliente", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-assembled-foreign-"));
    const key = "a7b8c9d0-e1f2-4345-9678-9abcdef01234.mp4";
    await new LocalDiskStorage(tmp).put(key, mp4MagicBuffer(80), {
      contentType: "video/mp4",
      sizeBytes: 80,
    });

    const restore = installMediaMocks({
      mediaRoot: tmp,
      // Cliente auth ok but ownership miss; Operator also fails role → 404
      requireOperator: async () => {
        const err = new Error("forbidden") as Error & {
          status: number;
          envelope: unknown;
        };
        err.status = 403;
        err.envelope = { ok: false, error: { code: "FORBIDDEN" } };
        throw err;
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: VICTIM_ID,
                client_id: VICTIM_ID,
                asset_type: "assembled_reel",
                storage_key: key,
                metadata: {
                  detectedMime: "video/mp4",
                  sizeBytes: 80,
                  durationSec: 30,
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    });

    try {
      const { resetMediaStorageCacheForTests } = loadMediaModule("./storage/get-media-storage.ts");
      resetMediaStorageCacheForTests();
      const { GET } = loadMediaModule("../../app/api/media/assets/[assetId]/route.ts");
      const res = await GET(
        new Request("http://localhost/api/media/assets/" + VICTIM_ID),
        { params: Promise.resolve({ assetId: VICTIM_ID }) },
      );
      assert.equal(res.status, 404);
    } finally {
      restore();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("migration defines neuramark_media_assets with RLS", () => {
    const mig = path.join(
      repoRoot,
      "supabase/migrations/20260829230000_neuramark_media_assets.sql",
    );
    assert.equal(existsSync(mig), true);
    const sql = readFileSync(mig, "utf8");
    assert.match(sql, /neuramark_media_assets/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /avatar_reference/);
    assert.match(sql, /storage_key/);
    assert.doesNotMatch(sql, /visual_preferences/);
  });
});

describe("png allowlist smoke", () => {
  it("accepts PNG magic bytes", async () => {
    const restore = installMediaMocks({
      hasActiveAvatarConsent: async () => true,
    });
    try {
            const { validateAndPrepareMediaUpload } = loadMediaModule("./upload-validation.ts");
      const result = await validateAndPrepareMediaUpload({
        userId: CLIENT_ID,
        assetType: "avatar_reference",
        file: pngBuffer(300),
        originalFilename: "shot.png",
        existingAssetCount: 0,
      });
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.prepared.detectedMime, "image/png");
    } finally {
      restore();
    }
  });
});
