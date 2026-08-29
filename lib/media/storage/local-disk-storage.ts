import "server-only";

import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { STORAGE_KEY_REGEX } from "@/lib/contracts/media-assets";
import type { MediaStorage } from "@/lib/media/storage/media-storage";

export class UnsafeStorageKeyError extends Error {
  constructor(key: string) {
    super(`Unsafe storage key rejected: ${key.slice(0, 64)}`);
    this.name = "UnsafeStorageKeyError";
  }
}

export class MediaRootUnderPublicError extends Error {
  constructor(root: string) {
    super(`Media root must not be under public/: ${root}`);
    this.name = "MediaRootUnderPublicError";
  }
}

/**
 * Local disk MediaStorage. Root must resolve outside public/ and Next static dirs.
 */
export class LocalDiskStorage implements MediaStorage {
  readonly root: string;

  constructor(rootAbsolute: string) {
    const resolved = path.resolve(rootAbsolute);
    assertRootOutsidePublic(resolved);
    this.root = resolved;
  }

  assertSafeKey(key: string): void {
    if (typeof key !== "string" || !STORAGE_KEY_REGEX.test(key)) {
      throw new UnsafeStorageKeyError(String(key ?? ""));
    }
    if (
      key.includes("..") ||
      key.includes("/") ||
      key.includes("\\") ||
      key.startsWith("/")
    ) {
      throw new UnsafeStorageKeyError(key);
    }
  }

  private absolutePath(key: string): string {
    this.assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep) && full !== this.root) {
      throw new UnsafeStorageKeyError(key);
    }
    return full;
  }

  async put(
    key: string,
    data: Buffer | ReadableStream,
    _meta: { contentType: string; sizeBytes: number },
  ): Promise<void> {
    const dest = this.absolutePath(key);
    await fs.mkdir(this.root, { recursive: true });
    const buffer =
      Buffer.isBuffer(data) ? data : Buffer.from(await new Response(data).arrayBuffer());
    await fs.writeFile(dest, buffer, { flag: "wx" });
  }

  async delete(key: string): Promise<void> {
    const dest = this.absolutePath(key);
    try {
      await fs.unlink(dest);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return;
      }
      throw error;
    }
  }

  async readStream(key: string): Promise<ReadableStream> {
    const dest = this.absolutePath(key);
    const nodeStream = createReadStream(dest);
    return Readable.toWeb(nodeStream) as ReadableStream;
  }
}

export function assertRootOutsidePublic(rootAbsolute: string): void {
  const root = path.resolve(rootAbsolute);
  const publicDir = path.resolve(process.cwd(), "public");
  if (root === publicDir || root.startsWith(publicDir + path.sep)) {
    throw new MediaRootUnderPublicError(root);
  }
  // Also reject if somehow nested under a path segment named public as project web root alias
  const normalized = root.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/public/") || normalized.endsWith("/public")) {
    // Only reject when the public segment is the project's public folder ancestry
    const rel = path.relative(process.cwd(), root);
    if (!rel.startsWith("..") && (rel === "public" || rel.startsWith(`public${path.sep}`))) {
      throw new MediaRootUnderPublicError(root);
    }
  }
}
