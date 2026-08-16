/** Shared DTOs for ImageBase creative remixes (nano banana image generation). */

export type ImageRemixDTO = {
  id: string;
  companyId: string;
  imageKey: string;
  status: string;
  headline: string;
  caption: string;
  prompt: string;
  sourceOcrText: string;
  /** Signed URL for the generated creative; null while a render failed. */
  imageUrl: string | null;
  /** The scraped asset the creative was remixed from. */
  sourceImageUrl: string | null;
  sourceUrl: string | null;
  provider: string;
  error: string | null;
  createdAt: string;
};
