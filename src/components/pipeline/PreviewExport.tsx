// src/components/pipeline/PreviewExport.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, Button, Badge, Spinner } from "@/components/ui";
import type { SegmentationResult } from "@/lib/pipeline-store";
import type { VoiceoverData } from "./VoiceoverStep";
import type { MediaSelectionData } from "./MediaSelection";
import {
  buildComposition,
  DEFAULT_EXPORT_SETTINGS,
  RESOLUTION_MAP,
  type ExportSettings,
  type VideoComposition,
  type AspectRatio,
  type TransitionType,
  type CaptionStyle,
} from "@/lib/remotion-config";
import {
  Play,
  Pause,
  Download,
  Settings,
  Monitor,
  Smartphone,
  Square,
  Type,
  Sparkles,
  Film,
  Volume2,
  Music,
  ChevronRight,
  Check,
  Loader,
  RotateCcw,
  ExternalLink,
  Copy,
  FileText,
  Image as ImageIcon,
  Scissors,
} from "lucide-react";

type ExportPhase = "config" | "exporting" | "complete" | "error";

type ExportJobStatus = {
  id: string;
  status: string;
  progress: number;
  output_url?: string;
  error?: string;
};

const STAGE_LABELS: Record<string, string> = {
  queued: "Preparing export...",
  downloading: "Downloading media assets",
  preparing: "Preparing composition assets",
  remotion_rendering: "Rendering video — captions, transitions, animations",
  complete: "Export complete!",
  error: "Export failed",
};

export default function PreviewExport({
  segments,
  voiceover,
  mediaSelections,
  onBack,
}: {
  segments: SegmentationResult;
  voiceover: VoiceoverData;
  mediaSelections: MediaSelectionData;
  onBack: () => void;
}) {
  const [settings, setSettings] = useState<ExportSettings>({ ...DEFAULT_EXPORT_SETTINGS });
  const [showSettings, setShowSettings] = useState(false);
  const [phase, setPhase] = useState<ExportPhase>("config");
  const [jobStatus, setJobStatus] = useState<ExportJobStatus | null>(null);
  const [playingSegment, setPlayingSegment] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const composition = buildComposition(
    segments.segments,
    voiceover,
    mediaSelections,
    settings
  );

  const resolution = RESOLUTION_MAP[settings.resolution]?.[settings.aspect_ratio];

  // --- Simulated playback ---
  const startPlayback = () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    setIsPlaying(true);
    let idx = 0;
    setPlayingSegment(composition.segments[0]?.id ?? null);

    playTimerRef.current = setInterval(() => {
      idx++;
      if (idx >= composition.segments.length) {
        stopPlayback();
        return;
      }
      setPlayingSegment(composition.segments[idx].id);
    }, (composition.segments[idx]?.duration_sec || 3) * 1000);
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    setPlayingSegment(null);
    if (playTimerRef.current) clearInterval(playTimerRef.current);
  };

  // --- Export ---
  const startExport = useCallback(async () => {
    setPhase("exporting");
    try {
      const resp = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ composition, action: "start" }),
      });
      if (!resp.ok) throw new Error("Export request failed");
      const data = await resp.json();

      setJobStatus({ id: data.job_id, status: "queued", progress: 0 });

      // Poll for progress
      pollRef.current = setInterval(async () => {
        try {
          const statusResp = await fetch(`/api/export?job_id=${data.job_id}`);
          if (!statusResp.ok) return;
          const status: ExportJobStatus = await statusResp.json();
          setJobStatus(status);

          if (status.status === "complete") {
            clearInterval(pollRef.current!);
            setPhase("complete");
          } else if (status.status === "error") {
            clearInterval(pollRef.current!);
            setPhase("error");
          }
        } catch { /* keep polling */ }
      }, 800);
    } catch (err) {
      setPhase("error");
      setJobStatus({
        id: "",
        status: "error",
        progress: 0,
        error: err instanceof Error ? err.message : "Export failed",
      });
    }
  }, [composition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const updateSettings = (partial: Partial<ExportSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  const updateCaptions = (partial: Partial<CaptionStyle>) => {
    setSettings((prev) => ({
      ...prev,
      captions: { ...prev.captions, ...partial },
    }));
  };

  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(text);
    setTimeout(() => setCopiedUrl(null), 1500);
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadMediaAsTxt = () => {
    const lines = composition.segments.map((seg) => {
      const url = seg.media.url || "No media selected";
      const duration = seg.duration_sec || 0;
      const timeRange = duration > 0 ? ` 0:00 to ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}` : "";
      return `${seg.text}\n${url}${timeRange}`;
    });
    triggerDownload(new Blob([lines.join("\n\n")], { type: "text/plain" }), "selected-media.txt");
  };

  const downloadMediaAsJson = () => {
    const data = composition.segments.map((seg) => ({
      segment_id: seg.id,
      keyword: seg.keyword,
      text: seg.text,
      duration_sec: seg.duration_sec,
      media_type: seg.media.type,
      media_url: seg.media.url,
      media_source: seg.media.source,
    }));
    triggerDownload(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "selected-media.json");
  };

  // =====================
  // EXPORTING PHASE
  // =====================
  if (phase === "exporting" && jobStatus) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="flex flex-col items-center py-10 gap-5">
            <div className="relative">
              <Spinner size={48} />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-indigo-600">
                {jobStatus.progress}%
              </span>
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm text-gray-900">
                {STAGE_LABELS[jobStatus.status] || "Processing..."}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {settings.resolution} · {settings.aspect_ratio} · {settings.fps}fps
              </p>
            </div>
            <div className="w-80">
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${jobStatus.progress}%` }}
                />
              </div>
              {/* Pipeline stage indicators */}
              <div className="flex justify-between mt-3 text-[10px] text-gray-400">
                {["Download", "Prepare", "Render"].map((label, i) => {
                  const stageProgress = [20, 30, 100];
                  const done = jobStatus.progress >= stageProgress[i];
                  const active = i > 0
                    ? jobStatus.progress >= stageProgress[i - 1] && jobStatus.progress < stageProgress[i]
                    : jobStatus.progress < stageProgress[i];
                  return (
                    <div key={label} className="flex flex-col items-center gap-1">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                          done
                            ? "bg-green-100 text-green-700"
                            : active
                            ? "bg-indigo-100 text-indigo-600 animate-pulse"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {done ? <Check size={10} /> : i + 1}
                      </div>
                      <span className={active ? "text-indigo-600 font-medium" : ""}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // =====================
  // COMPLETE PHASE
  // =====================
  if (phase === "complete") {
    return (
      <div className="space-y-4">
        <Card>
          <div className="flex flex-col items-center py-10 gap-4">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <Check size={28} className="text-green-600" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg text-gray-900">Export complete!</p>
              <p className="text-sm text-gray-500 mt-1">
                {composition.total_duration_sec}s · {settings.resolution} · {settings.aspect_ratio} · {settings.fps}fps
              </p>
            </div>
            <div className="flex gap-3 mt-2">
              <Button onClick={async () => {
                const url = jobStatus?.output_url;
                if (!url) return;
                try {
                  const resp = await fetch(url);
                  const contentType = resp.headers.get("Content-Type") || "";
                  if (contentType.includes("video") || contentType.includes("octet-stream")) {
                    // Real video file — download it
                    const blob = await resp.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = blobUrl;
                    a.download = `video-${settings.aspect_ratio}-${settings.resolution}.mp4`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(blobUrl);
                  } else {
                    // Simulated mode — download the composition as a project file instead
                    downloadMediaAsTxt();
                  }
                } catch {
                  // Fallback — try opening directly
                  window.open(url, "_blank");
                }
              }}>
                <Download size={15} /> Download video
              </Button>
              <Button variant="secondary" onClick={() => { setPhase("config"); setJobStatus(null); }}>
                <RotateCcw size={13} /> Export again
              </Button>
            </div>

            {/* Production note */}
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 max-w-sm text-center">
              <strong>Note:</strong> Without the Remotion render script, the download button exports your script with media URLs as a text file. Add <code>scripts/render.mjs</code> for actual video rendering.
            </div>
          </div>
        </Card>

        {/* Export in other formats */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Export in other formats</h3>
          <div className="grid grid-cols-3 gap-2">
            {(["9:16", "16:9", "1:1"] as AspectRatio[]).map((ar) => {
              const isCurrent = ar === settings.aspect_ratio;
              return (
                <button
                  key={ar}
                  disabled={isCurrent}
                  onClick={() => {
                    updateSettings({ aspect_ratio: ar });
                    setPhase("config");
                    setJobStatus(null);
                  }}
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    isCurrent
                      ? "border-green-300 bg-green-50 text-green-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <div className="text-sm font-semibold">{ar}</div>
                  <div className="text-[10px] mt-0.5">
                    {ar === "9:16" ? "Reels / TikTok" : ar === "16:9" ? "YouTube" : "Square"}
                  </div>
                  {isCurrent && <Badge variant="success">Done</Badge>}
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    );
  }

  // =====================
  // ERROR PHASE
  // =====================
  if (phase === "error") {
    return (
      <div className="space-y-4">
        <Card>
          <div className="flex flex-col items-center py-10 gap-4">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center text-2xl">
              ✕
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-900">Export failed</p>
              <p className="text-sm text-red-600 mt-1">{jobStatus?.error || "Unknown error"}</p>
            </div>
            <Button onClick={() => { setPhase("config"); setJobStatus(null); }}>
              <RotateCcw size={13} /> Try again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // =====================
  // CONFIG PHASE (main preview + settings)
  // =====================
  return (
    <div className="space-y-4">
      {/* Video preview area */}
      <Card flush>
        <div
          className="relative bg-gray-900 flex items-center justify-center overflow-hidden"
          style={{
            aspectRatio: settings.aspect_ratio === "9:16" ? "9/16" : settings.aspect_ratio === "1:1" ? "1/1" : "16/9",
            maxHeight: 420,
          }}
        >
          {/* Show current segment's media */}
          {composition.segments.map((seg) => {
            const isActive = playingSegment === seg.id || (!isPlaying && composition.segments[0]?.id === seg.id);
            if (!isActive) return null;
            return (
              <div key={seg.id} className="absolute inset-0">
                <img
                  src={seg.media.url || `https://picsum.photos/seed/${seg.id}/1920/1080`}
                  alt={seg.text}
                  className="w-full h-full object-cover"
                />
                {/* Caption overlay */}
                {settings.captions.enabled && (
                  <div
                    className={`absolute left-4 right-4 text-center ${
                      settings.captions.position === "bottom"
                        ? "bottom-8"
                        : settings.captions.position === "top"
                        ? "top-8"
                        : "top-1/2 -translate-y-1/2"
                    }`}
                  >
                    <span
                      className={`inline-block px-3 py-1.5 rounded-lg leading-snug ${
                        settings.captions.background === "semi-transparent"
                          ? "bg-black/50"
                          : settings.captions.background === "solid"
                          ? "bg-black"
                          : settings.captions.background === "blur"
                          ? "backdrop-blur-md bg-black/30"
                          : ""
                      } ${
                        settings.captions.fontSize === "small"
                          ? "text-xs"
                          : settings.captions.fontSize === "large"
                          ? "text-lg"
                          : "text-sm"
                      }`}
                      style={{ color: settings.captions.color }}
                    >
                      {settings.captions.style === "bold-highlight"
                        ? seg.text.split(" ").map((word, i) => (
                            <span key={i}>
                              {i > 0 && " "}
                              {i % 3 === 0 ? <strong>{word}</strong> : word}
                            </span>
                          ))
                        : seg.text}
                    </span>
                  </div>
                )}
                {/* Segment info overlay */}
                <div className="absolute top-3 left-3 flex gap-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-black/60 text-white">
                    Segment {seg.id}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/80 text-white">
                    {seg.duration_sec}s
                  </span>
                </div>
              </div>
            );
          })}

          {/* Play button overlay */}
          <button
            onClick={startPlayback}
            className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors z-10"
          >
            <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              {isPlaying ? (
                <Pause size={22} className="text-gray-800" />
              ) : (
                <Play size={22} className="text-gray-800 ml-1" />
              )}
            </div>
          </button>
        </div>
      </Card>

      {/* Timeline */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-600">Timeline</span>
          <span className="text-xs text-gray-400">{composition.total_duration_sec}s total</span>
        </div>

        {/* Video track */}
        <div className="flex gap-0.5 h-14 rounded-lg overflow-hidden bg-gray-100 mb-1.5">
          {composition.segments.map((seg, i) => {
            const pct = (seg.duration_sec / composition.total_duration_sec) * 100;
            const isActive = playingSegment === seg.id;
            return (
              <div key={seg.id} className="flex" style={{ width: `${Math.max(pct, 3)}%` }}>
                {/* Transition indicator between segments */}
                {seg.transition_in && seg.transition_in !== "none" && (
                  <div
                    className="w-1 shrink-0 bg-indigo-400 relative group cursor-default"
                    title={`Transition: ${seg.transition_in}`}
                  >
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-20">
                      {seg.transition_in}
                    </div>
                  </div>
                )}
                <div
                  className={`relative overflow-hidden rounded transition-all cursor-pointer flex-1 ${
                    isActive ? "ring-2 ring-indigo-400" : ""
                  }`}
                  onClick={() => setPlayingSegment(seg.id)}
                >
                  <img
                    src={seg.media.url || `https://picsum.photos/seed/${seg.id}/200/100`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-1">
                    <span className="text-[9px] text-white font-semibold">{seg.duration_sec}s</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Audio tracks */}
        {voiceover.mode !== "no_audio" && (
          <div className="h-5 bg-indigo-50 rounded flex items-center px-2 mb-1">
            <Volume2 size={10} className="text-indigo-400 mr-1" />
            <span className="text-[10px] text-indigo-600 font-medium">
              {voiceover.mode === "upload" ? `Voiceover: ${voiceover.uploaded_file?.name}` : "AI Voiceover"}
            </span>
          </div>
        )}
        {composition.background_music && (
          <div className="h-5 bg-amber-50 rounded flex items-center px-2">
            <Music size={10} className="text-amber-500 mr-1" />
            <span className="text-[10px] text-amber-700 font-medium">
              Music: {composition.background_music.name}
            </span>
          </div>
        )}
        {settings.captions.enabled && (
          <div className="h-5 bg-green-50 rounded flex items-center px-2 mt-1">
            <Type size={10} className="text-green-500 mr-1" />
            <span className="text-[10px] text-green-700 font-medium">
              Captions: {settings.captions.style}
            </span>
          </div>
        )}
      </Card>

      {/* Quick settings */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Export settings</h3>
          <Button variant="ghost" onClick={() => setShowSettings(!showSettings)}>
            <Settings size={13} /> {showSettings ? "Less" : "More"} options
          </Button>
        </div>

        {/* Aspect ratio */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Format</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { ratio: "9:16" as AspectRatio, label: "Reels / TikTok / Shorts", icon: Smartphone },
              { ratio: "16:9" as AspectRatio, label: "YouTube / Landscape", icon: Monitor },
              { ratio: "1:1" as AspectRatio, label: "Square / Instagram", icon: Square },
            ]).map(({ ratio, label, icon: Icon }) => (
              <button
                key={ratio}
                onClick={() => updateSettings({ aspect_ratio: ratio })}
                className={`p-2.5 rounded-lg border text-center transition-colors ${
                  settings.aspect_ratio === ratio
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <Icon
                  size={16}
                  className={`mx-auto mb-1 ${settings.aspect_ratio === ratio ? "text-indigo-600" : "text-gray-400"}`}
                />
                <div className={`text-xs font-semibold ${settings.aspect_ratio === ratio ? "text-indigo-700" : "text-gray-700"}`}>
                  {ratio}
                </div>
                <div className="text-[10px] text-gray-500">{label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Resolution + FPS row */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Resolution</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(["720p", "1080p", "4K"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => updateSettings({ resolution: r })}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    settings.resolution === r
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {resolution && (
              <p className="text-[10px] text-gray-400 mt-1">{resolution.width}×{resolution.height}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Frame rate</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {([24, 30, 60] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => updateSettings({ fps: f })}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    settings.fps === f
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {f}fps
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Transitions */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Transitions</label>
          <p className="text-[10px] text-gray-400 mb-2">Select multiple — they get randomized across segments for a natural feel</p>
          <div className="flex flex-wrap gap-1.5">
            {([
              { id: "crossfade" as TransitionType, label: "Crossfade" },
              { id: "fade-zoom" as TransitionType, label: "Fade zoom" },
              { id: "blur-fade" as TransitionType, label: "Blur fade" },
              { id: "slide-left" as TransitionType, label: "Slide left" },
              { id: "slide-right" as TransitionType, label: "Slide right" },
              { id: "slide-up" as TransitionType, label: "Slide up" },
              { id: "wipe" as TransitionType, label: "Wipe" },
              { id: "zoom" as TransitionType, label: "Zoom" },
              { id: "none" as TransitionType, label: "Cut (no effect)" },
            ]).map((t) => {
              const isSelected = settings.transitions.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    if (isSelected) {
                      // Don't allow deselecting if it's the only one
                      if (settings.transitions.length > 1) {
                        updateSettings({
                          transitions: settings.transitions.filter((tr) => tr !== t.id),
                        });
                      }
                    } else {
                      updateSettings({
                        transitions: [...settings.transitions, t.id],
                      });
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    isSelected
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {isSelected && <Check size={11} />}
                  {t.label}
                </button>
              );
            })}
          </div>
          {settings.transitions.length > 1 && (
            <p className="text-[10px] text-indigo-500 mt-1.5">
              {settings.transitions.length} transitions selected — will be randomized, no consecutive repeats
            </p>
          )}
        </div>

        {/* Extended settings */}
        {showSettings && (
          <div className="pt-4 border-t border-gray-100 space-y-4">
            {/* Captions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-600">Captions</label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.captions.enabled}
                    onChange={(e) => updateCaptions({ enabled: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-500"
                  />
                  <span className="text-xs text-gray-600">Enabled</span>
                </label>
              </div>
              {settings.captions.enabled && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Position</label>
                    <select
                      value={settings.captions.position}
                      onChange={(e) => updateCaptions({ position: e.target.value as CaptionStyle["position"] })}
                      className="w-full p-1.5 text-xs border border-gray-200 rounded-lg bg-white"
                    >
                      <option value="bottom">Bottom</option>
                      <option value="center">Center</option>
                      <option value="top">Top</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Style</label>
                    <select
                      value={settings.captions.style}
                      onChange={(e) => updateCaptions({ style: e.target.value as CaptionStyle["style"] })}
                      className="w-full p-1.5 text-xs border border-gray-200 rounded-lg bg-white"
                    >
                      <option value="default">Default</option>
                      <option value="bold-highlight">Bold highlight</option>
                      <option value="word-by-word">Word by word</option>
                      <option value="karaoke">Karaoke</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Size</label>
                    <select
                      value={settings.captions.fontSize}
                      onChange={(e) => updateCaptions({ fontSize: e.target.value as CaptionStyle["fontSize"] })}
                      className="w-full p-1.5 text-xs border border-gray-200 rounded-lg bg-white"
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Ken Burns */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-600">Ken Burns (zoom/pan)</label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.ken_burns.enabled}
                    onChange={(e) => updateSettings({
                      ken_burns: { ...settings.ken_burns, enabled: e.target.checked },
                    })}
                    className="rounded border-gray-300 text-indigo-500"
                  />
                  <span className="text-xs text-gray-600">Enabled</span>
                </label>
              </div>
              {settings.ken_burns.enabled && (
                <div className="flex gap-1.5">
                  {(["subtle", "medium", "dramatic"] as const).map((i) => (
                    <button
                      key={i}
                      onClick={() => updateSettings({ ken_burns: { ...settings.ken_burns, intensity: i } })}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-medium capitalize transition-colors ${
                        settings.ken_burns.intensity === i
                          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Volume controls */}
            <div className="grid grid-cols-2 gap-4">
              {voiceover.mode !== "no_audio" && voiceover.mode !== "music_only" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Voiceover volume: {settings.voiceover_volume}%
                  </label>
                  <input
                    type="range" min="0" max="100" value={settings.voiceover_volume}
                    onChange={(e) => updateSettings({ voiceover_volume: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>
              )}
              {composition.background_music && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Music volume: {settings.background_music_volume}%
                  </label>
                  <input
                    type="range" min="0" max="100" value={settings.background_music_volume}
                    onChange={(e) => updateSettings({ background_music_volume: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Composition summary */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Composition summary</h3>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: "Segments", value: composition.segments.length },
            { label: "Duration", value: `${composition.total_duration_sec}s` },
            { label: "Frames", value: composition.total_frames.toLocaleString() },
            { label: "Output", value: `${resolution?.width}×${resolution?.height}` },
          ].map((item) => (
            <div key={item.label} className="py-2 px-1 rounded-lg bg-gray-50">
              <p className="text-sm font-bold text-indigo-500 m-0">{item.value}</p>
              <p className="text-[10px] text-gray-500 mt-0.5 uppercase">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Remotion pipeline note */}
        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 flex items-start gap-2">
          <Sparkles size={13} className="text-indigo-400 shrink-0 mt-0.5" />
          <span>
            <strong className="text-gray-700">Rendering pipeline:</strong> Remotion renders the full composition — captions,{" "}
            {settings.transitions.length > 1
              ? `${settings.transitions.length} randomized transitions (${settings.transitions.join(", ")})`
              : settings.transitions[0] || "no"}{" "}
            transitions, Ken Burns {settings.ken_burns.enabled ? settings.ken_burns.intensity : "off"} — exported as {settings.resolution} MP4.
          </span>
        </div>
      </Card>

      {/* Selected Media */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Selected media</h3>
          <div className="flex gap-1.5">
            <Button variant="ghost" onClick={downloadMediaAsTxt}>
              <FileText size={12} /> .txt
            </Button>
            <Button variant="ghost" onClick={downloadMediaAsJson}>
              <Download size={12} /> .json
            </Button>
          </div>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {composition.segments.map((seg) => {
            const duration = seg.duration_sec || 0;
            const timeRange = duration > 0 ? `0:00 to ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}` : "";
            return (
              <div key={seg.id} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex items-start gap-3">
                  <div className="w-16 h-10 rounded overflow-hidden bg-gray-200 shrink-0 mt-0.5">
                    <img
                      src={seg.media.url || `https://picsum.photos/seed/${seg.id}/400/300`}
                      alt="" className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${seg.id}/400/300`; }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-800 leading-relaxed">{seg.text}</p>
                    {seg.media.url ? (
                      <div className="flex items-center gap-1 mt-1">
                        <a
                          href={seg.media.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-indigo-500 hover:text-indigo-700 truncate max-w-[70%]"
                          title={seg.media.url}
                        >
                          {seg.media.url}
                          <ExternalLink size={9} className="inline ml-1 -mt-0.5" />
                        </a>
                        {timeRange && <span className="text-[10px] text-gray-400 shrink-0">{timeRange}</span>}
                        {seg.media.clip_in != null && seg.media.clip_out != null && (
                          <span className="text-[10px] text-indigo-500 shrink-0 flex items-center gap-0.5">
                            <Scissors size={9} />
                            {seg.media.clip_in.toFixed(1)}s → {seg.media.clip_out.toFixed(1)}s
                          </span>
                        )}
                        <button
                          onClick={() => copyToClipboard(seg.media.url)}
                          className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 shrink-0 ml-auto"
                          title="Copy URL"
                        >
                          {copiedUrl === seg.media.url ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-gray-400 mt-1 block">No media selected</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Action bar */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="secondary" onClick={onBack}>
          ← Back to media
        </Button>
        <Button onClick={startExport}>
          <Film size={15} /> Export video
        </Button>
      </div>
    </div>
  );
}