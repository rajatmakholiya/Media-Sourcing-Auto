// src/components/pipeline/MediaSelection.tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, Button, Badge, Spinner } from "@/components/ui";
import type { SegmentationResult } from "@/lib/pipeline-store";
import type { VoiceoverData } from "./VoiceoverStep";
import {
  Search,
  Upload,
  Link,
  Check,
  X,
  Image as ImageIcon,
  Film,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Download,
  Copy,
  ExternalLink,
  Scissors,
  Play,
  Pause,
} from "lucide-react";

// --- Types ---

type MediaResult = {
  id: string;
  type: "image" | "video";
  thumbnail: string;
  preview_url: string;
  full_url: string;
  source: string;
  author: string;
  width: number;
  height: number;
  duration_sec?: number;
  title?: string;
  platform?: string;
};

type SegmentMedia = {
  segment_id: number;
  images: MediaResult[];
  videos: MediaResult[];
  selected: MediaResult | null;
  custom: { type: "upload" | "url"; url: string; name: string } | null;
  clip_in?: number;   // seconds — trim start (video only)
  clip_out?: number;  // seconds — trim end (video only)
  loading: boolean;
  searched: boolean;
  activeTab: "images" | "videos";
};

export type MediaSelectionData = {
  selections: {
    segment_id: number;
    media: MediaResult | { id: string; type: string; url: string; source: string; clip_in?: number; clip_out?: number };
  }[];
};

// --- Video Preview Modal ---

function VideoPreviewModal({
  media,
  dialogueDuration,
  initialClipIn,
  initialClipOut,
  onConfirm,
  onCancel,
}: {
  media: MediaResult;
  dialogueDuration: number;
  initialClipIn: number;
  initialClipOut: number;
  onConfirm: (clipIn: number, clipOut: number) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState<number>(media.duration_sec || 0);
  const [clipIn, setClipIn] = useState(initialClipIn);
  const [clipOut, setClipOut] = useState(initialClipOut);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const animRef = useRef<number | null>(null);
  const playingRef = useRef(false);

  // Detect YouTube / embeddable platform URLs
  const ytEmbedUrl = (() => {
    const url = media.preview_url || media.full_url || "";
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/);
    return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=0&rel=0` : null;
  })();

  // YouTube → iframe directly (never try <video> for yt links)
  // Non-YouTube → <video>, fallback to external link on error
  const showMode = ytEmbedUrl ? "iframe" : videoError ? "fallback" : "video";

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m}:${String(s).padStart(2, "0")}.${ms}`;
  };

  const clipDuration = Math.round((clipOut - clipIn) * 100) / 100;
  const durationError = clipDuration > dialogueDuration;

  // Editable input state (string while typing, parsed on blur)
  const [inInput, setInInput] = useState(formatTime(initialClipIn));
  const [outInput, setOutInput] = useState(formatTime(initialClipOut));

  // Keep inputs in sync when clip values change programmatically
  useEffect(() => { setInInput(formatTime(clipIn)); }, [clipIn]);
  useEffect(() => { setOutInput(formatTime(clipOut)); }, [clipOut]);

  const parseTime = (s: string): number | null => {
    const m1 = s.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);
    if (m1) {
      return parseInt(m1[1]) * 60 + parseInt(m1[2]) + (m1[3] ? parseFloat(`0.${m1[3]}`) : 0);
    }
    const m2 = s.match(/^(\d+(?:\.\d+)?)$/);
    return m2 ? parseFloat(m2[1]) : null;
  };

  const commitInInput = () => {
    const v = parseTime(inInput);
    if (v !== null) handleClipInChange(v);
    else setInInput(formatTime(clipIn));
  };

  const commitOutInput = () => {
    const v = parseTime(outInput);
    if (v !== null) handleClipOutChange(v);
    else setOutInput(formatTime(clipOut));
  };

  // When video metadata loads, get real duration
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      if (isFinite(dur) && dur > 0) {
        setVideoDuration(dur);
        // Adjust clipOut if it exceeds actual duration
        if (clipOut > dur) {
          setClipOut(Math.min(dur, clipIn + dialogueDuration));
        }
      }
    }
  };

  // Sync playback position loop
  useEffect(() => {
    const tick = () => {
      if (videoRef.current) {
        const t = videoRef.current.currentTime;
        setCurrentTime(t);
        // Stop when reaching clipOut — only if actually playing
        if (playingRef.current && t >= clipOut) {
          playingRef.current = false;
          videoRef.current.pause();
          videoRef.current.currentTime = clipIn;
          setIsPlaying(false);
        }
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [clipIn, clipOut]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playingRef.current) {
      playingRef.current = false;
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      // Start from clipIn if before it or past clipOut
      if (videoRef.current.currentTime < clipIn || videoRef.current.currentTime >= clipOut) {
        videoRef.current.currentTime = clipIn;
      }
      playingRef.current = true;
      setIsPlaying(true);
      videoRef.current.play().catch(() => {
        playingRef.current = false;
        setIsPlaying(false);
      });
    }
  };

  const handleClipInChange = (val: number) => {
    const v = Math.max(0, Math.min(val, clipOut - 0.1));
    setClipIn(Math.round(v * 100) / 100);
    if (videoRef.current) videoRef.current.currentTime = v;
  };

  const handleClipOutChange = (val: number) => {
    const v = Math.max(clipIn + 0.1, Math.min(val, videoDuration));
    setClipOut(Math.round(v * 100) / 100);
  };



  // Compute the trim region as percentages for the visual bar

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Scissors size={15} className="text-indigo-500" />
            <span className="text-sm font-semibold text-gray-900">Trim video clip</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="duration">Dialogue: {dialogueDuration}s</Badge>
            <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Video player */}
        <div className="relative bg-black aspect-video">
          {showMode === "video" && (
            <>
              <video
                ref={videoRef}
                src={media.preview_url || media.full_url}
                className="w-full h-full object-contain"
                onLoadedMetadata={handleLoadedMetadata}
                onError={() => setVideoError(true)}
                onEnded={() => { playingRef.current = false; setIsPlaying(false); }}
                preload="metadata"
                playsInline
              />
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                  {isPlaying ? <Pause size={18} className="text-gray-800" /> : <Play size={18} className="text-gray-800 ml-0.5" />}
                </div>
              </button>
            </>
          )}
          {showMode === "iframe" && (
            <iframe
              src={ytEmbedUrl!}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
          {showMode === "fallback" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
              <Film size={32} />
              <span className="text-sm">Preview not available in browser</span>
              <a
                href={media.preview_url || media.full_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 underline"
              >
                <ExternalLink size={12} /> Open video externally
              </a>
              <span className="text-xs text-gray-500 mt-1">Set trim points manually below</span>
            </div>
          )}
        </div>

        {/* Clip stamp buttons — only when direct <video> works */}
        {showMode === "video" && (
          <div className="px-5 pt-3 pb-1 flex items-center gap-2">
            <button
              onClick={() => handleClipInChange(currentTime)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 text-xs font-semibold text-gray-700 hover:text-indigo-700 transition-colors"
            >
              <Scissors size={12} /> Mark In — <span className="font-mono">{formatTime(currentTime)}</span>
            </button>
            <button
              onClick={() => handleClipOutChange(currentTime)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 text-xs font-semibold text-gray-700 hover:text-indigo-700 transition-colors"
            >
              <Scissors size={12} /> Mark Out — <span className="font-mono">{formatTime(currentTime)}</span>
            </button>
          </div>
        )}

        {/* For iframe (YouTube) — always show external link as escape hatch */}
        {showMode === "iframe" && (
          <div className="px-5 pt-2 pb-1 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">Video blocked? Watch externally and enter timestamps below</span>
            <a
              href={media.preview_url || media.full_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-medium"
            >
              <ExternalLink size={12} /> Open in YouTube
            </a>
          </div>
        )}

        {/* Trim controls */}
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Clip In */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Clip In</label>
              <input
                type="text"
                value={inInput}
                onChange={(e) => setInInput(e.target.value)}
                onBlur={commitInInput}
                onKeyDown={(e) => e.key === "Enter" && commitInInput()}
                className="w-full font-mono text-sm text-center border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white"
                placeholder="0:00.0"
              />
              <div className="grid grid-cols-4 gap-1">
                {([-1, -0.1, 0.1, 1] as const).map((delta) => (
                  <button
                    key={delta}
                    onClick={() => handleClipInChange(clipIn + delta)}
                    className="text-[10px] font-mono py-1 rounded border border-gray-200 hover:bg-gray-50 hover:border-gray-300 text-gray-600 transition-colors"
                  >
                    {delta > 0 ? `+${delta}` : delta}s
                  </button>
                ))}
              </div>
            </div>

            {/* Clip Out */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Clip Out</label>
              <input
                type="text"
                value={outInput}
                onChange={(e) => setOutInput(e.target.value)}
                onBlur={commitOutInput}
                onKeyDown={(e) => e.key === "Enter" && commitOutInput()}
                className="w-full font-mono text-sm text-center border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white"
                placeholder="0:00.0"
              />
              <div className="grid grid-cols-4 gap-1">
                {([-1, -0.1, 0.1, 1] as const).map((delta) => (
                  <button
                    key={delta}
                    onClick={() => handleClipOutChange(clipOut + delta)}
                    className="text-[10px] font-mono py-1 rounded border border-gray-200 hover:bg-gray-50 hover:border-gray-300 text-gray-600 transition-colors"
                  >
                    {delta > 0 ? `+${delta}` : delta}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Duration info */}
          <div className="flex items-center gap-3 text-xs pt-0.5">
            <span className="text-gray-500">Clip: <strong className={durationError ? "text-red-600" : "text-indigo-600"}>{clipDuration.toFixed(1)}s</strong></span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">Dialogue: <strong className="text-gray-700">{dialogueDuration}s</strong></span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">Video: <strong className="text-gray-700">{videoDuration > 0 ? videoDuration.toFixed(1) : "—"}s</strong></span>
            {showMode === "video" && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">Now: <strong className="text-gray-700 font-mono">{formatTime(currentTime)}</strong></span>
              </>
            )}
          </div>

          {/* Duration error */}
          {durationError && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              <span>
                Clip ({clipDuration.toFixed(1)}s) exceeds dialogue ({dialogueDuration}s). Trim to {dialogueDuration}s or less.
              </span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
          <div className="text-[10px] text-gray-400">
            Video is streamed for preview — not downloaded until export
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button
              onClick={() => onConfirm(clipIn, clipOut)}
              disabled={durationError}
            >
              <Scissors size={13} /> Use this clip
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Component ---

export default function MediaSelection({
  segments,
  voiceover,
  onComplete,
  onBack,
}: {
  segments: SegmentationResult;
  voiceover: VoiceoverData;
  onComplete: (data: MediaSelectionData) => void;
  onBack: () => void;
}) {
  const [segmentMedia, setSegmentMedia] = useState<SegmentMedia[]>(() =>
    segments.segments.map((s) => ({
      segment_id: s.id,
      images: [],
      videos: [],
      selected: null,
      custom: null,
      clip_in: undefined,
      clip_out: undefined,
      loading: false,
      searched: false,
      activeTab: "images" as const,
    }))
  );
  // Video preview modal state
  const [previewModal, setPreviewModal] = useState<{
    segId: number;
    media: MediaResult;
    dialogueDuration: number;
  } | null>(null);
  const [expandedSeg, setExpandedSeg] = useState<number | null>(
    segments.segments[0]?.id ?? null
  );
  const [contentAge, setContentAge] = useState<"any" | "24h" | "week" | "month" | "year">("any");
  const [enabledSources, setEnabledSources] = useState<string[]>(["google", "firecrawl"]);
  const [urlInput, setUrlInput] = useState<Record<number, string>>({});
  const [keywordInput, setKeywordInput] = useState<Record<number, string>>(() =>
    Object.fromEntries(segments.segments.map((s) => [s.id, s.image_query || s.keyword || ""]))
  );
  const [isDemo, setIsDemo] = useState(false);
  const [searchAllLoading, setSearchAllLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showDownloadPanel, setShowDownloadPanel] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [copiedUrls, setCopiedUrls] = useState(false);
  const uploadRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const selectedCount = segmentMedia.filter((sm) => sm.selected || sm.custom).length;
  const allSelected = selectedCount === segments.segments.length;

  // --- Search ---
  const searchSegment = useCallback(
    async (segId: number, overrideQuery?: string) => {
      setSegmentMedia((prev) =>
        prev.map((sm) => (sm.segment_id === segId ? { ...sm, loading: true } : sm))
      );

      const seg = segments.segments.find((s) => s.id === segId);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
        const resp = await fetch("/api/media-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            image_query: overrideQuery || seg?.image_query || seg?.keyword || "general",
            video_query: overrideQuery || seg?.video_query || seg?.keyword || "general footage",
            segment_id: segId,
            content_age: contentAge,
            sources: enabledSources,
          }),
        });
        clearTimeout(timeout);

        if (!resp.ok) throw new Error("Search failed");
        const data = await resp.json();
        if (data.is_demo) setIsDemo(true);

        setSegmentMedia((prev) =>
          prev.map((sm) =>
            sm.segment_id === segId
              ? { ...sm, images: data.images || [], videos: data.videos || [], loading: false, searched: true }
              : sm
          )
        );
      } catch {
        setSegmentMedia((prev) =>
          prev.map((sm) => (sm.segment_id === segId ? { ...sm, loading: false, searched: true } : sm))
        );
      }
    },
    [segments, contentAge, enabledSources]
  );

  const searchAll = useCallback(async () => {
    setSearchAllLoading(true);
    await Promise.all(segments.segments.map((seg) => searchSegment(seg.id)));
    setSearchAllLoading(false);
    setExpandedSeg(segments.segments[0]?.id ?? null);
  }, [segments, searchSegment]);

  // Auto-search first segment on mount
  useEffect(() => {
    if (segments.segments.length > 0 && !segmentMedia[0]?.searched) {
      searchSegment(segments.segments[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Selection ---
  const selectMedia = (segId: number, media: MediaResult, clipIn?: number, clipOut?: number) => {
    setSegmentMedia((prev) =>
      prev.map((sm) => (sm.segment_id === segId ? { ...sm, selected: media, custom: null, clip_in: clipIn, clip_out: clipOut } : sm))
    );
  };

  // Open video preview modal instead of directly selecting
  const openVideoPreview = (segId: number, media: MediaResult) => {
    const seg = segments.segments.find((s) => s.id === segId);
    const voResult = voiceover.results.find((r) => r.segment_id === segId);
    const dialogueDuration = voResult?.duration_sec || seg?.estimated_duration_sec || 5;
    setPreviewModal({ segId, media, dialogueDuration });
  };

  const handleVideoClipConfirm = (clipIn: number, clipOut: number) => {
    if (!previewModal) return;
    selectMedia(previewModal.segId, previewModal.media, clipIn, clipOut);
    autoAdvance(previewModal.segId);
    setPreviewModal(null);
  };

  const handleUpload = (segId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSegmentMedia((prev) =>
      prev.map((sm) =>
        sm.segment_id === segId ? { ...sm, selected: null, custom: { type: "upload", url, name: file.name } } : sm
      )
    );
    e.target.value = "";
  };

  const handleUrlSubmit = (segId: number) => {
    const url = urlInput[segId]?.trim();
    if (!url) return;
    setSegmentMedia((prev) =>
      prev.map((sm) =>
        sm.segment_id === segId
          ? { ...sm, selected: null, custom: { type: "url", url, name: url.split("/").pop() || "URL media" } }
          : sm
      )
    );
    setUrlInput((prev) => ({ ...prev, [segId]: "" }));
  };

  const clearSelection = (segId: number) => {
    setSegmentMedia((prev) =>
      prev.map((sm) => (sm.segment_id === segId ? { ...sm, selected: null, custom: null, clip_in: undefined, clip_out: undefined } : sm))
    );
  };

  // Auto-advance to next unselected segment
  const autoAdvance = (currentSegId: number) => {
    const currentIdx = segments.segments.findIndex((s) => s.id === currentSegId);
    for (let i = currentIdx + 1; i < segments.segments.length; i++) {
      const sm = segmentMedia.find((m) => m.segment_id === segments.segments[i].id);
      if (sm && !sm.selected && !sm.custom) {
        const nextId = segments.segments[i].id;
        setExpandedSeg(nextId);
        if (!sm.searched) searchSegment(nextId);
        return;
      }
    }
  };

  // --- Download all ---
  const getSelectedMediaList = () => {
    return segmentMedia
      .filter((sm) => sm.selected || sm.custom)
      .map((sm) => {
        const seg = segments.segments.find((s) => s.id === sm.segment_id);
        const url = sm.selected?.full_url || sm.selected?.preview_url || sm.custom?.url || "";
        return {
          segment_id: sm.segment_id,
          text: seg?.text || "",
          url,
          source: sm.selected?.source || sm.custom?.type || "",
          type: sm.selected?.type || (sm.custom?.url.match(/\.(mp4|webm|mov)/i) ? "video" : "image"),
        };
      });
  };

  const copyAllUrls = async () => {
    const list = getSelectedMediaList();
    const lines = list.map((m) => {
      const seg = segments.segments.find((s) => s.id === m.segment_id);
      const duration = seg?.estimated_duration_sec || 0;
      const timeRange = duration > 0 ? ` 0:00 to ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}` : "";
      return `${m.text}\n${m.url}${timeRange}`;
    });
    await navigator.clipboard.writeText(lines.join("\n\n"));
    setCopiedUrls(true);
    setTimeout(() => setCopiedUrls(false), 2000);
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

  const downloadUrlsAsTextFile = () => {
    const list = getSelectedMediaList();
    const lines = list.map((m) => {
      const seg = segments.segments.find((s) => s.id === m.segment_id);
      const duration = seg?.estimated_duration_sec || 0;
      const timeRange = duration > 0 ? ` 0:00 to ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}` : "";
      return `${m.text}\n${m.url}${timeRange}`;
    });
    triggerDownload(new Blob([lines.join("\n\n")], { type: "text/plain" }), `media-urls-${Date.now()}.txt`);
  };

  const downloadAllMedia = async () => {
    setDownloadingAll(true);
    const list = getSelectedMediaList();

    // First, download the URL list as a text file
    downloadUrlsAsTextFile();

    // Then download each media file via server proxy (bypasses CORS)
    for (const item of list) {
      if (!item.url) continue;
      try {
        const proxyUrl = `/api/media-sourcing/proxy-download?url=${encodeURIComponent(item.url)}`;
        const resp = await fetch(proxyUrl);
        if (!resp.ok) throw new Error(`${resp.status}`);
        const blob = await resp.blob();
        const ext = item.type === "video" ? "mp4" : "jpg";
        triggerDownload(blob, `segment-${item.segment_id}.${ext}`);
        // Small delay between downloads so browser doesn't block them
        await new Promise((r) => setTimeout(r, 500));
      } catch {
        // If proxy also fails, open in new tab
        window.open(item.url, "_blank");
      }
    }
    setDownloadingAll(false);
  };

  // --- Proceed ---
  const handleProceed = () => {
    const selections = segmentMedia
      .filter((sm) => sm.selected || sm.custom)
      .map((sm) => ({
        segment_id: sm.segment_id,
        media: sm.selected
          ? {
              ...sm.selected,
              ...(sm.clip_in != null ? { clip_in: sm.clip_in } : {}),
              ...(sm.clip_out != null ? { clip_out: sm.clip_out } : {}),
            }
          : {
              id: `custom-${sm.segment_id}`,
              type: sm.custom!.url.match(/\.(mp4|webm|mov)/i) ? "video" : "image",
              url: sm.custom!.url,
              source: sm.custom!.type === "upload" ? "Uploaded" : "URL",
            },
      }));
    onComplete({ selections } as MediaSelectionData);
  };

  // --- Render ---
  return (
    <div className="space-y-4">
      {/* Video Preview Modal */}
      {previewModal && (
        <VideoPreviewModal
          media={previewModal.media}
          dialogueDuration={previewModal.dialogueDuration}
          initialClipIn={0}
          initialClipOut={Math.min(
            previewModal.dialogueDuration,
            previewModal.media.duration_sec || previewModal.dialogueDuration
          )}
          onConfirm={handleVideoClipConfirm}
          onCancel={() => setPreviewModal(null)}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Badge variant="info">{selectedCount}/{segments.segments.length} selected</Badge>
          {isDemo && <Badge variant="fallback">Demo mode — add API keys for real results</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showFilters ? "primary" : "secondary"}
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? "!bg-indigo-100 !text-indigo-700 !border-indigo-200" : ""}
          >
            <Search size={13} /> Filters
          </Button>
          <Button variant="secondary" onClick={searchAll} disabled={searchAllLoading}>
            <Search size={13} /> {searchAllLoading ? "Searching..." : "Search all"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Content age</label>
              <select
                value={contentAge}
                onChange={(e) => setContentAge(e.target.value as typeof contentAge)}
                className="w-full p-2 text-xs border border-gray-200 rounded-lg bg-white"
              >
                <option value="any">Any time</option>
                <option value="24h">Past 24 hours</option>
                <option value="week">Past week</option>
                <option value="month">Past month</option>
                <option value="year">Past year</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Sources</label>
              <div className="flex flex-col gap-1">
                {[
                  { id: "google", label: "Google Images & Videos (Serper)" },
                  { id: "firecrawl", label: "Deep web search (Firecrawl)" },
                ].map((src) => (
                  <label key={src.id} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabledSources.includes(src.id)}
                      onChange={(e) => {
                        setEnabledSources((prev) =>
                          e.target.checked ? [...prev, src.id] : prev.filter((s) => s !== src.id)
                        );
                      }}
                      className="rounded border-gray-300 text-indigo-500 focus:ring-indigo-300"
                    />
                    {src.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {isDemo && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            <strong>Demo mode</strong> — showing placeholder images. Add PEXELS_API_KEY, PIXABAY_API_KEY, or SERPER_API_KEY to .env.local for real media.
          </div>
        </div>
      )}

      {/* Segment cards */}
      {segments.segments.map((seg, idx) => {
        const sm = segmentMedia.find((m) => m.segment_id === seg.id)!;
        const isExpanded = expandedSeg === seg.id;
        const hasSelection = !!sm.selected || !!sm.custom;

        return (
          <Card key={seg.id} flush className="overflow-hidden">
            {/* Header — always visible */}
            <button
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              onClick={() => {
                const next = isExpanded ? null : seg.id;
                setExpandedSeg(next);
                if (next && !sm.searched) searchSegment(seg.id);
              }}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                hasSelection ? "bg-green-100 text-green-700" : "bg-indigo-50 text-indigo-500"
              }`}>
                {hasSelection ? <Check size={13} /> : idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 m-0 truncate">{seg.text}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <Badge variant="keyword">{seg.image_query || seg.keyword}</Badge>
                  <Badge variant="duration">
                    {voiceover.results.find((r) => r.segment_id === seg.id)?.duration_sec || seg.estimated_duration_sec}s
                  </Badge>
                  {hasSelection && (
                    <Badge variant="success">
                      {sm.selected ? `${sm.selected.source} · ${sm.selected.type}` : `Custom ${sm.custom?.type}`}
                    </Badge>
                  )}
                  {sm.clip_in != null && sm.clip_out != null && (
                    <Badge variant="duration">
                      <Scissors size={9} className="inline mr-0.5" />
                      {sm.clip_in.toFixed(1)}s → {sm.clip_out.toFixed(1)}s
                    </Badge>
                  )}
                </div>
              </div>
              {hasSelection && (
                <div className="w-14 h-10 rounded overflow-hidden bg-gray-100 shrink-0">
                  <img src={sm.selected?.thumbnail || sm.custom?.url || ""} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              {isExpanded ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                {/* Keyword editor + Research */}
                <div className="flex gap-2 mb-3">
                  <div className="flex-1 relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      className="w-full pl-9 pr-3 py-2 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 placeholder:text-gray-400"
                      placeholder="Enter keyword to search..."
                      value={keywordInput[seg.id] || ""}
                      onChange={(e) => setKeywordInput((prev) => ({ ...prev, [seg.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") searchSegment(seg.id, keywordInput[seg.id]);
                      }}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => searchSegment(seg.id, keywordInput[seg.id])}
                    disabled={sm.loading}
                    className="!px-3"
                  >
                    <RefreshCw size={13} className={sm.loading ? "animate-spin" : ""} />
                    {sm.loading ? "Searching..." : "Research"}
                  </Button>
                </div>

                {/* Loading */}
                {sm.loading && (
                  <div className="flex items-center justify-center py-8 gap-3">
                    <Spinner size={24} />
                    <span className="text-sm text-gray-500">Searching...</span>
                  </div>
                )}

                {/* Side-by-side Images and Videos columns */}
                {!sm.loading && sm.searched && (
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    {/* Images column */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-200">
                        <ImageIcon size={13} className="text-indigo-500" />
                        <span className="text-xs font-semibold text-gray-700">Images ({sm.images.length})</span>
                      </div>
                      {sm.images.length === 0 ? (
                        <div className="text-center py-6 text-xs text-gray-400">No images found</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-1.5 max-h-[400px] overflow-y-auto pr-1">
                          {sm.images.map((media) => {
                            const isSelected = sm.selected?.id === media.id;
                            return (
                              <div
                                key={media.id}
                                onClick={() => { selectMedia(seg.id, media); autoAdvance(seg.id); }}
                                className={`relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                                  isSelected ? "border-indigo-500 shadow-md" : "border-transparent hover:border-gray-300"
                                }`}
                              >
                                <div className="aspect-video bg-gray-100">
                                  <img
                                    src={media.thumbnail} alt={media.source}
                                    className="w-full h-full object-cover" loading="lazy"
                                    onError={(e) => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${media.id}/400/300`; }}
                                  />
                                </div>
                                <div className="absolute top-1 left-1 flex gap-0.5 flex-wrap">
                                  <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-black/60 text-white">{media.source}</span>
                                  {media.width >= 1920 && (
                                    <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-green-500/80 text-white">HD</span>
                                  )}
                                </div>
                                {isSelected && (
                                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                                    <Check size={9} className="text-white" />
                                  </div>
                                )}
                                <div className="px-1.5 py-1">
                                  <p className="text-[9px] text-gray-600 truncate m-0">{media.title || media.author}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Videos column */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-200">
                        <Film size={13} className="text-red-500" />
                        <span className="text-xs font-semibold text-gray-700">Videos ({sm.videos.length})</span>
                      </div>
                      {sm.videos.length === 0 ? (
                        <div className="text-center py-6 text-xs text-gray-400">No videos found</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-1.5 max-h-[400px] overflow-y-auto pr-1">
                          {sm.videos.map((media) => {
                            const isSelected = sm.selected?.id === media.id;
                            return (
                              <div
                                key={media.id}
                                onClick={() => openVideoPreview(seg.id, media)}
                                className={`relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                                  isSelected ? "border-indigo-500 shadow-md" : "border-transparent hover:border-gray-300"
                                }`}
                              >
                                <div className="aspect-video bg-gray-100">
                                  <img
                                    src={media.thumbnail} alt={media.source}
                                    className="w-full h-full object-cover" loading="lazy"
                                    onError={(e) => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${media.id}/400/300`; }}
                                  />
                                </div>
                                <div className="absolute top-1 left-1 flex gap-0.5 flex-wrap">
                                  <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-black/60 text-white">{media.source}</span>
                                  {media.platform && (
                                    <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-red-500/80 text-white">{media.platform}</span>
                                  )}
                                  {media.duration_sec && (
                                    <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-black/60 text-white">
                                      {Math.floor(media.duration_sec / 60)}:{String(Math.floor(media.duration_sec % 60)).padStart(2, "0")}
                                    </span>
                                  )}
                                </div>
                                {/* Scissors icon to indicate preview/trim */}
                                <div className="absolute bottom-6 right-1">
                                  <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/80 text-white flex items-center gap-0.5">
                                    <Scissors size={8} /> Trim
                                  </span>
                                </div>
                                {isSelected && (
                                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                                    <Check size={9} className="text-white" />
                                  </div>
                                )}
                                <div className="px-1.5 py-1">
                                  <p className="text-[9px] text-gray-600 truncate m-0">{media.title || media.author}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Upload / URL */}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-2">
                  <input
                    ref={(el) => { uploadRefs.current[seg.id] = el; }}
                    type="file" accept="image/*,video/*" className="hidden"
                    onChange={(e) => { handleUpload(seg.id, e); autoAdvance(seg.id); }}
                  />
                  <Button variant="secondary" onClick={() => uploadRefs.current[seg.id]?.click()}>
                    <Upload size={13} /> Upload
                  </Button>
                  <div className="flex-1 flex gap-1.5">
                    <div className="flex-1 relative">
                      <Link size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 placeholder:text-gray-400"
                        placeholder="Paste image or video URL here (e.g. https://example.com/photo.jpg)"
                        value={urlInput[seg.id] || ""}
                        onChange={(e) => setUrlInput((prev) => ({ ...prev, [seg.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") { handleUrlSubmit(seg.id); autoAdvance(seg.id); } }}
                      />
                    </div>
                    {urlInput[seg.id] && (
                      <Button variant="secondary" onClick={() => { handleUrlSubmit(seg.id); autoAdvance(seg.id); }}>
                        <Link size={13} /> Use
                      </Button>
                    )}
                  </div>
                  {hasSelection && (
                    <button onClick={() => clearSelection(seg.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded" title="Clear selection">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {sm.custom && (
                  <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-indigo-50 border border-indigo-200 text-sm">
                    <Check size={14} className="text-indigo-600 shrink-0" />
                    <span className="text-indigo-700 text-xs truncate flex-1">
                      {sm.custom.type === "upload" ? "Uploaded" : "URL"}: {sm.custom.name}
                    </span>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {/* Download all selected media — optional */}
      {selectedCount > 0 && (
        <Card>
          <button
            className="w-full flex items-center justify-between text-left"
            onClick={() => setShowDownloadPanel(!showDownloadPanel)}
          >
            <div className="flex items-center gap-2">
              <Download size={15} className="text-indigo-500" />
              <span className="text-sm font-semibold text-gray-900">Download selected media</span>
              <Badge variant="info">{selectedCount} files</Badge>
            </div>
            {showDownloadPanel ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </button>

          {showDownloadPanel && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              {/* URL list */}
              <div className="max-h-48 overflow-y-auto mb-3 space-y-1">
                {getSelectedMediaList().map((item) => (
                  <div key={item.segment_id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 text-xs">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                      {item.segment_id}
                    </span>
                    <span className="flex-1 truncate text-gray-600 font-mono">{item.url || "No URL"}</span>
                    <Badge variant={item.type === "video" ? "duration" : "keyword"}>
                      {item.type}
                    </Badge>
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-indigo-500">
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <Button variant="secondary" onClick={copyAllUrls}>
                  {copiedUrls ? <Check size={13} /> : <Copy size={13} />}
                  {copiedUrls ? "Copied!" : "Copy URLs"}
                </Button>
                <Button variant="secondary" onClick={downloadUrlsAsTextFile}>
                  <Download size={13} /> Save URLs (.txt)
                </Button>
                <Button variant="secondary" onClick={downloadAllMedia} disabled={downloadingAll}>
                  <Download size={13} className={downloadingAll ? "animate-bounce" : ""} />
                  {downloadingAll ? "Downloading..." : "Download all files + URLs"}
                </Button>
              </div>

              <p className="text-[10px] text-gray-400 mt-2">
                Optional — you can skip this and go directly to export.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Bottom actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="secondary" onClick={onBack}>← Back to voiceover</Button>
        <Button onClick={handleProceed} disabled={!allSelected}>
          {allSelected
            ? "Continue to preview & export →"
            : `Select media for ${segments.segments.length - selectedCount} more segment${segments.segments.length - selectedCount !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  );
}