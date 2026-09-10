/**
 * Browser-side prep for avatar reference uploads.
 * Vercel request bodies are capped well below our app image limit (10 MiB),
 * so large phone photos must be resized/compressed before the Server Action.
 */

/** Stay under typical Vercel/Next body ceilings with multipart overhead. */
export const AVATAR_REFERENCE_UPLOAD_SAFE_MAX_BYTES = 2.5 * 1024 * 1024;

const MAX_EDGE = 2048;
const JPEG_QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45] as const;

function looksLikeImage(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type.startsWith("image/") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".webp")
  );
}

function looksLikeVideo(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type.startsWith("video/") ||
    name.endsWith(".mp4") ||
    name.endsWith(".mov")
  );
}

function outputFilename(original: string): string {
  const base = original.replace(/\.[^.]+$/, "") || "reference";
  return `${base}.jpg`;
}

async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

async function canvasToJpegBlob(
  source: ImageBitmap,
  quality: number,
): Promise<Blob> {
  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas_unavailable");
  }
  ctx.drawImage(source, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/jpeg", quality);
  });
  if (!blob) {
    throw new Error("jpeg_encode_failed");
  }
  return blob;
}

/**
 * Returns a File ready for the avatar-reference Server Action.
 * Images above the safe body budget are re-encoded as JPEG ≤ 2048px.
 * Videos are passed through (platform may still reject oversized clips).
 */
export async function prepareAvatarReferenceUpload(file: File): Promise<File> {
  if (looksLikeVideo(file) || !looksLikeImage(file)) {
    return file;
  }

  if (
    file.size <= AVATAR_REFERENCE_UPLOAD_SAFE_MAX_BYTES &&
    file.type !== "image/heic" &&
    file.type !== "image/heif"
  ) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await loadImageBitmap(file);
  } catch {
    // Undecodable in-browser (e.g. HEIC on some browsers) — let the server reject.
    return file;
  }

  try {
    let best: Blob | null = null;
    for (const quality of JPEG_QUALITIES) {
      const blob = await canvasToJpegBlob(bitmap, quality);
      best = blob;
      if (blob.size <= AVATAR_REFERENCE_UPLOAD_SAFE_MAX_BYTES) {
        break;
      }
    }

    if (!best) {
      return file;
    }

    return new File([best], outputFilename(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}
