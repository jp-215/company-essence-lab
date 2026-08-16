/**
 * Instagram's CDN blocks AI providers from crawling asset URLs (robots.txt), so
 * every vision call has to inline the bytes instead of passing a link. This
 * helper downloads an asset once and returns it in both base64 and data-URL form.
 */
export type FetchedImage = {
  base64: string;
  mimeType: string;
  dataUrl: string;
};

export async function fetchImageAsBase64(imageUrl: string): Promise<FetchedImage> {
  const response = await fetch(imageUrl, {
    headers: {
      // The CDN serves plain fetches but rejects requests with no UA.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/jpeg,image/png,*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`Could not download image [${response.status}]`);
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  if (!buffer.byteLength) throw new Error("Downloaded image was empty");

  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  const mimeType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0]!;

  return { base64, mimeType, dataUrl: `data:${mimeType};base64,${base64}` };
}
