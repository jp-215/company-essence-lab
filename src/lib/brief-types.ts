/**
 * Browser-safe types for the Creative Brief contract Vira sends to vira-engine.
 * The JSON shape is documented field-by-field in docs/VIDEO_BRIEF.md — keep the
 * two in sync when either side changes.
 */

export type SignalStatus = "pending" | "done" | "failed";
export type SignalQuality = "high" | "low";

export type CopyRoles = {
  headline: string;
  subhead: string;
  priceOrOffer: string;
  cta: string;
  brandMentions: string[];
  hashtags: string[];
};

export type ImageSentiment = {
  tone: string;
  score: number;
  emotionTags: string[];
  intent: string;
  urgency: number;
};

export type ImageTexture = {
  palette: string[];
  lighting: string;
  surfaceTexture: string[];
  finish: string;
  contrast: number;
  saturation: number;
  noiseLevel: number;
};

export type ImageComposition = {
  aspectRatio: string;
  subject: string;
  framing: string;
  focalDepth: string;
  textPlacement: string;
  negativeSpace: number;
};

export type ImageMotion = {
  impliedMotion: string;
  suggestedCamera: string;
  suggestedBeats: string[];
};

export type ImageSignalDTO = {
  imageKey: string;
  model: string;
  status: SignalStatus;
  signalQuality: SignalQuality;
  usable: boolean;
  blockers: string[];
  copyRoles: CopyRoles;
  sentiment: ImageSentiment;
  texture: ImageTexture;
  composition: ImageComposition;
  motion: ImageMotion;
  analyzedAt: string | null;
  error: string | null;
};

export type BriefReference =
  | {
      type: "image";
      imageKey: string;
      sourceUrl: string;
      imageUrl: string;
      weight: number;
      ocr: { text: string; headline: string; cta: string; confidence: number };
      sentiment: ImageSentiment;
      texture: ImageTexture;
      composition: ImageComposition;
      motion: ImageMotion;
      keep: string[];
      avoid: string[];
    }
  | {
      type: "trend";
      trendKey: string;
      platform: string;
      hook: string;
      format: string;
      weight: number;
      whyItWorks: string;
    };

export type BriefBeat = {
  t: number;
  shot: string;
  onScreenText: string;
};

export type CreativeBrief = {
  briefId: string | null;
  durationSeconds: number;
  aspectRatio: string;
  brand: {
    name: string;
    slug: string;
    bio: string;
    mission: string;
    category: string;
    toneGuardrails: string[];
    palette: string[];
    mustSay: string[];
    neverSay: string[];
  };
  references: BriefReference[];
  narrative: {
    hook: string;
    beats: BriefBeat[];
    voiceover: string;
    cta: string;
    textOverlayPolicy: string;
  };
  style: {
    look: string;
    palette: string[];
    pace: string;
    musicMood: string;
    captions: boolean;
  };
  constraints: {
    noRealPeopleLikeness: boolean;
    noCompetitorMarks: boolean;
    language: string;
    safetyNotes: string[];
  };
  /** Assets we refused to use, surfaced to the founder. */
  excluded: Array<{ imageKey: string; reason: string }>;
  signalQuality: SignalQuality;
};

export type PreparedBrief = {
  briefId: string;
  brief: CreativeBrief;
};
