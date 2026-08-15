const MAX_LOGO_EDGE = 512;

/**
 * Downscales an image to at most 512px on its longest edge before upload —
 * logos render in ~54-78px boxes, so full-resolution phone photos (often 1-2MB)
 * waste bandwidth on every page that shows them. Falls back to the original
 * file for formats the canvas can't decode (e.g. HEIC).
 */
export async function downscaleImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = MAX_LOGO_EDGE / Math.max(bitmap.width, bitmap.height);
    if (scale >= 1) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
}
