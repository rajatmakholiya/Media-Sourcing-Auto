// src/lib/remotion-config.ts
// Defines the video composition settings for Remotion rendering
// This maps our pipeline data into Remotion's composition format

export type AspectRatio = "9:16" | "16:9" | "1:1";

export type TransitionType = "crossfade" | "slide-left" | "slide-right" | "slide-up" | "wipe" | "zoom" | "fade-zoom" | "blur-fade" | "none";

export type CaptionStyle = {
  enabled: boolean;
  position: "bottom" | "center" | "top";
  fontSize: "small" | "medium" | "large";
  style: "default" | "bold-highlight" | "word-by-word" | "karaoke";
  background: "semi-transparent" | "solid" | "none" | "blur";
  color: string;
};

export type KenBurnsEffect = {
  enabled: boolean;
  intensity: "subtle" | "medium" | "dramatic";
  // Direction is auto-determined per segment for variety
};

export type ExportSettings = {
  aspect_ratio: AspectRatio;
  resolution: "720p" | "1080p" | "4K";
  fps: 24 | 30 | 60;
  transitions: TransitionType[]; // multiple transitions, randomized per segment
  transition_duration_frames: number;
  captions: CaptionStyle;
  ken_burns: KenBurnsEffect;
  background_music_volume: number; // 0-100
  voiceover_volume: number; // 0-100
};

export type SegmentComposition = {
  id: number;
  text: string;
  keyword: string;
  duration_sec: number;
  duration_frames: number;
  media: {
    type: "image" | "video";
    url: string;
    source: string;
  };
  voiceover: {
    audio_base64: string | null;
    provider: string;
  } | null;
  // Per-segment randomized effects
  ken_burns_direction: "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up" | "pan-down";
  transition_in: TransitionType; // transition INTO this segment
};

export type VideoComposition = {
  segments: SegmentComposition[];
  settings: ExportSettings;
  total_duration_sec: number;
  total_frames: number;
  background_music?: { url: string; name: string };
  voiceover_file?: { url: string; name: string };
};

// Resolution presets
export const RESOLUTION_MAP: Record<string, Record<AspectRatio, { width: number; height: number }>> = {
  "720p": {
    "9:16": { width: 720, height: 1280 },
    "16:9": { width: 1280, height: 720 },
    "1:1": { width: 720, height: 720 },
  },
  "1080p": {
    "9:16": { width: 1080, height: 1920 },
    "16:9": { width: 1920, height: 1080 },
    "1:1": { width: 1080, height: 1080 },
  },
  "4K": {
    "9:16": { width: 2160, height: 3840 },
    "16:9": { width: 3840, height: 2160 },
    "1:1": { width: 2160, height: 2160 },
  },
};

// Ken Burns direction cycle for visual variety
const KB_DIRECTIONS: SegmentComposition["ken_burns_direction"][] = [
  "zoom-in", "pan-left", "zoom-out", "pan-right", "pan-up", "pan-down",
];

// Default export settings
export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  aspect_ratio: "9:16",
  resolution: "1080p",
  fps: 30,
  transitions: ["crossfade", "fade-zoom", "blur-fade"], // cinematic defaults
  transition_duration_frames: 18, // 0.6s at 30fps — smooth but not sluggish
  captions: {
    enabled: true,
    position: "bottom",
    fontSize: "medium",
    style: "bold-highlight",
    background: "semi-transparent",
    color: "#ffffff",
  },
  ken_burns: {
    enabled: true,
    intensity: "medium",
  },
  background_music_volume: 20,
  voiceover_volume: 100,
};

// Seeded random for deterministic but varied transition assignment
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Pick a transition for each segment, avoiding consecutive repeats
function assignTransitions(
  segmentCount: number,
  availableTransitions: TransitionType[]
): TransitionType[] {
  if (availableTransitions.length === 0) return Array(segmentCount).fill("none");
  if (availableTransitions.length === 1) return Array(segmentCount).fill(availableTransitions[0]);

  const rand = seededRandom(segmentCount * 7 + 31);
  const result: TransitionType[] = [];
  let lastPick = "";

  for (let i = 0; i < segmentCount; i++) {
    // First segment has no transition_in (it's the opening)
    if (i === 0) {
      result.push("none");
      continue;
    }

    // Filter out the last used transition to avoid repeats
    const choices = availableTransitions.filter((t) => t !== lastPick);
    const pool = choices.length > 0 ? choices : availableTransitions;
    const pick = pool[Math.floor(rand() * pool.length)];
    result.push(pick);
    lastPick = pick;
  }

  return result;
}

// Build the full composition from pipeline data
export function buildComposition(
  segments: { id: number; text: string; keyword: string; estimated_duration_sec: number }[],
  voiceover: {
    mode: string;
    results: { segment_id: number; audio_base64: string | null; duration_sec: number; provider: string }[];
    uploaded_file?: { url: string; name: string; duration_sec: number };
    background_music?: { url: string; name: string };
  },
  mediaSelections: {
    selections: { segment_id: number; media: { type: string; url?: string; full_url?: string; source: string } }[];
  },
  settings: ExportSettings
): VideoComposition {
  const fps = settings.fps;
  const transitions = assignTransitions(segments.length, settings.transitions);

  const composedSegments: SegmentComposition[] = segments.map((seg, i) => {
    const voResult = voiceover.results.find((r) => r.segment_id === seg.id);
    const mediaSel = mediaSelections.selections.find((s) => s.segment_id === seg.id);
    const duration = voResult?.duration_sec || seg.estimated_duration_sec;

    return {
      id: seg.id,
      text: seg.text,
      keyword: seg.keyword,
      duration_sec: duration,
      duration_frames: Math.round(duration * fps),
      media: {
        type: (mediaSel?.media?.type as "image" | "video") || "image",
        url: mediaSel?.media?.full_url || mediaSel?.media?.url || "",
        source: mediaSel?.media?.source || "Unknown",
      },
      voiceover: voResult
        ? { audio_base64: voResult.audio_base64, provider: voResult.provider }
        : null,
      ken_burns_direction: KB_DIRECTIONS[i % KB_DIRECTIONS.length],
      transition_in: transitions[i],
    };
  });

  const totalDuration = composedSegments.reduce((a, s) => a + s.duration_sec, 0);

  return {
    segments: composedSegments,
    settings,
    total_duration_sec: Math.round(totalDuration * 10) / 10,
    total_frames: Math.round(totalDuration * fps),
    background_music: voiceover.background_music,
    voiceover_file: voiceover.uploaded_file,
  };
}