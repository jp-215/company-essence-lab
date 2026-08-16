/** Shared (browser-safe) types for the ImageBase OCR layer. */

export type OcrStatus = "pending" | "done" | "empty" | "failed";

export type OcrBlock = {
  /** Text of the detected block/line. */
  text: string;
  /** Normalised bounding box (0-1) so the UI can overlay it on any render size. */
  box: { x: number; y: number; w: number; h: number };
  confidence: number;
};

export type ImageOcrDTO = {
  imageKey: string;
  provider: string;
  status: OcrStatus;
  /** Full extracted text, newline separated in reading order. */
  text: string;
  wordCount: number;
  languages: string[];
  confidence: number;
  blocks: OcrBlock[];
  scannedAt: string | null;
  error: string | null;
};

export type OcrCoverage = {
  totalImages: number;
  scanned: number;
  withText: number;
  failed: number;
};

export type OcrBatchResult = {
  requested: number;
  scanned: number;
  withText: number;
  failed: number;
  provider: string;
};
