// src/app/tools/media-sourcing/page.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { Card, Button, Badge, Spinner, Textarea } from "@/components/ui";
import {
  Search, Check, X, Upload, Link as LinkIcon, ChevronDown, ChevronUp,
  RefreshCw, Download, ArrowLeft, Image as ImageIcon, FileText, Pencil, Film,
  ExternalLink, ShieldOff,
} from "lucide-react";

type SourcingMode = "slideshow" | "video";

type Slide = {
  id: number;
  text: string;
  image_query: string;
  video_query?: string;
  subject: string;
  estimated_duration_sec?: number;
  // AI-derived relevance context — forwarded to the search API for scoring and
  // negative-keyword injection. Optional for backward compatibility with older
  // cached segmentation responses.
  media_intent?: "portrait" | "action" | "scene" | "event" | "concept";
  search_entities?: string[];
  exclude_terms?: string[];
  alternate_queries?: { image?: string[]; video?: string[] };
};

type MediaResult = {
  id: string;
  type: "image";
  thumbnail: string;
  preview_url: string;
  full_url: string;
  source: string;
  author: string;
  width: number;
  height: number;
  title?: string;
  page_url?: string;
};

type SourceStatus = "idle" | "loading" | "done" | "error";

type SlideMedia = {
  slide_id: number;
  images: MediaResult[];
  videos: MediaResult[];
  selected: MediaResult[];       // Multi-select: 1-3 images
  selectedVideo: MediaResult | null;
  custom: { url: string; name: string } | null;
  customUrls: string[];          // User-entered image URLs to include in final export
  loading: boolean;              // True while any source is still loading
  searched: boolean;
  sourceStatus: Record<string, SourceStatus>;
};

// Sources the client fans out to, fired in parallel. Each gets its own column.
const IMAGE_SOURCES = ["Imago", "Imagn", "Google", "Google CC", "Firecrawl", "Pexels"] as const;
const VIDEO_SOURCES = ["Google Video"] as const;

type Phase = "input" | "processing" | "selection" | "export";

const SAMPLE_SCRIPT = `With the NFL Draft clock ticking, Wednesday's pro day circuit saw future stars solidify their stock and sleepers emerge from the shadows. While a dozen potential draftees at Texas A&M commanded a large crowd of scouts, it was a versatile athlete at Nebraska who may have made the biggest leap of the day.

Texas A&M: Aggies Showcase Depth
KC Concepcion (WR/RS): A projected first-round pick, Concepcion did not participate in the workout following a minor knee procedure. His draft stock remains high with visits to the Patriots, Ravens, and Titans.

Tyler Onyedim (DL): After skipping the combine drills, Onyedim clocked a 4.92-second 40-yard dash. He looked fluid in position drills and met with the Patriots, Cowboys, and Jets.

Nebraska: Sleepers and Specialists
Emmett Johnson (RB): The Big Ten Running Back of the Year improved his combine numbers, timing between 4.46 and 4.53 seconds in the 40-yard dash.

Heinrich Haarberg (TE): The standout of the day, the former quarterback turned tight end measured nearly 6'5" and 237 lbs with a 4.51-second 40-yard dash. He is drawing significant interest from the Buffalo Bills.`;

export default function MediaSourcingPage() {
  const [script, setScript] = useState("");
  const [sourcingMode, setSourcingMode] = useState<SourcingMode>("slideshow");
  const [phase, setPhase] = useState<Phase>("input");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [slideMedia, setSlideMedia] = useState<SlideMedia[]>([]);
  const [expandedSlide, setExpandedSlide] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [editingQuery, setEditingQuery] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [allowNonLicensed, setAllowNonLicensed] = useState(false);
  const uploadRefs = useRef<Record<number, HTMLInputElement | null>>({});
  // Track in-flight search requests per slide. Only the latest request's response
  // is allowed to update state — prevents stale responses from overwriting fresh results.
  const searchTokens = useRef<Record<number, number>>({});
  // Abort controllers so re-searching a slide cancels the previous fetch.
  const searchAborters = useRef<Record<number, AbortController>>({});

  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const selectedCount = slideMedia.filter((sm) => sm.selected.length > 0 || sm.custom || sm.customUrls.length > 0).length;
  // Per-slide draft of the URL input field — keyed by slide id so adding one
  // URL on slide A doesn't clear the field on slide B.
  const [urlDrafts, setUrlDrafts] = useState<Record<number, string>>({});
  const allSelected = slides.length > 0 && selectedCount === slides.length;
  const isVideoMode = sourcingMode === "video";

  // --- Process script ---
  const processScript = useCallback(async () => {
    setPhase("processing");
    setError("");
    try {
      const resp = await fetch("/api/media-sourcing/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, script_type: isVideoMode ? "MSN Video" : "MSN Slideshow" }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Processing failed");
      }
      const data = await resp.json();
      setSlides(data.slides || []);
      setAnalysis(data.article_analysis || null);
      setSlideMedia(
        (data.slides || []).map((s: Slide) => ({
          slide_id: s.id,
          images: [],
          videos: [],
          selected: [],
          selectedVideo: null,
          custom: null,
          customUrls: [],
          loading: false,
          searched: false,
          sourceStatus: {},
        }))
      );
      setPhase("selection");
      // Auto-search first slide
      if (data.slides?.length > 0) {
        setExpandedSlide(data.slides[0].id);
        searchSlide(data.slides[0].id, data.slides[0].image_query, data.slides);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setPhase("input");
    }
  }, [script]);

  // --- Search media for a slide ---
  // Fires one request per source in parallel. Each source's column is independently
  // populated as it responds — slow sources show a skeleton while fast ones are already interactive.
  const searchSlide = useCallback(async (slideId: number, query?: string, slidesOverride?: Slide[]) => {
    const currentSlides = slidesOverride || slides;
    const slide = currentSlides.find((s) => s.id === slideId);
    const q = query || slide?.image_query || "";

    // Cancel any in-flight requests for this slide and mint a new token.
    searchAborters.current[slideId]?.abort();
    const aborter = new AbortController();
    searchAborters.current[slideId] = aborter;
    const myToken = (searchTokens.current[slideId] || 0) + 1;
    searchTokens.current[slideId] = myToken;

    const sourcesToQuery: string[] = [
      ...IMAGE_SOURCES,
      ...(isVideoMode ? VIDEO_SOURCES : []),
    ];

    // Reset images/videos, mark all sources as loading, clear any prior results.
    const initialStatus: Record<string, SourceStatus> = {};
    for (const s of sourcesToQuery) initialStatus[s] = "loading";
    setSlideMedia((prev) =>
      prev.map((sm) =>
        sm.slide_id === slideId
          ? { ...sm, images: [], videos: [], loading: true, searched: true, sourceStatus: initialStatus }
          : sm
      )
    );

    // Kick off all source fetches in parallel and update state as each settles.
    await Promise.all(
      sourcesToQuery.map(async (src) => {
        try {
          const resp = await fetch("/api/media-sourcing/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: q,
              video_query: slide?.video_query || q,
              slide_id: slideId,
              mode: isVideoMode ? "video" : "slideshow",
              source: src,
              allow_non_licensed: allowNonLicensed,
              // Relevance context — only forwarded when the user hasn't typed
              // a manual override query (i.e. we're using the AI-generated one).
              search_entities: query ? [] : slide?.search_entities || [],
              exclude_terms: query ? [] : slide?.exclude_terms || [],
              alternate_queries: query ? undefined : slide?.alternate_queries,
              // Subject = the canonical entity this segment is about (e.g.
              // "NFL Draft 2025"). Editorial archives like Imago/Imagn index
              // subjects, not visual moments — the route uses this broader
              // query for those providers to avoid 0-result searches when the
              // image_query is narrow ("... countdown board").
              subject: query ? undefined : slide?.subject,
            }),
            signal: aborter.signal,
          });
          if (!resp.ok) throw new Error(`${src} failed`);
          const data = await resp.json();

          // Stale-response guard.
          if (searchTokens.current[slideId] !== myToken) return;

          setSlideMedia((prev) =>
            prev.map((sm) => {
              if (sm.slide_id !== slideId) return sm;
              const newImages = [...sm.images, ...(data.images || [])];
              const newVideos = [...sm.videos, ...(data.videos || [])];
              const nextStatus = { ...sm.sourceStatus, [src]: "done" as SourceStatus };
              const stillLoading = Object.values(nextStatus).some((s) => s === "loading");
              return { ...sm, images: newImages, videos: newVideos, sourceStatus: nextStatus, loading: stillLoading };
            })
          );
        } catch (err) {
          if ((err as Error)?.name === "AbortError") return;
          if (searchTokens.current[slideId] !== myToken) return;
          setSlideMedia((prev) =>
            prev.map((sm) => {
              if (sm.slide_id !== slideId) return sm;
              const nextStatus = { ...sm.sourceStatus, [src]: "error" as SourceStatus };
              const stillLoading = Object.values(nextStatus).some((s) => s === "loading");
              return { ...sm, sourceStatus: nextStatus, loading: stillLoading };
            })
          );
        }
      })
    );
  }, [slides, isVideoMode]);

  const searchAll = useCallback(async () => {
    for (const slide of slides) {
      await searchSlide(slide.id, slide.image_query);
    }
  }, [slides, searchSlide]);

  const selectMedia = (slideId: number, media: MediaResult) => {
    setSlideMedia((prev) =>
      prev.map((sm) => {
        if (sm.slide_id !== slideId) return sm;
        const alreadySelected = sm.selected.some((s) => s.id === media.id);
        let next: MediaResult[];
        if (alreadySelected) {
          // Deselect
          next = sm.selected.filter((s) => s.id !== media.id);
        } else if (sm.selected.length >= 3) {
          // At max — replace the oldest selection
          next = [...sm.selected.slice(1), media];
        } else {
          // Add
          next = [...sm.selected, media];
        }
        return { ...sm, selected: next, custom: null };
      })
    );
  };

  const autoAdvance = (currentId: number) => {
    const idx = slides.findIndex((s) => s.id === currentId);
    for (let i = idx + 1; i < slides.length; i++) {
      const sm = slideMedia.find((m) => m.slide_id === slides[i].id);
      if (sm && sm.selected.length === 0 && !sm.custom) {
        const nextId = slides[i].id;
        setExpandedSlide(nextId);
        if (!sm.searched) searchSlide(nextId);
        return;
      }
    }
  };

  const handleUpload = (slideId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSlideMedia((prev) =>
      prev.map((sm) =>
        sm.slide_id === slideId ? { ...sm, selected: [], custom: { url: URL.createObjectURL(file), name: file.name } } : sm
      )
    );
    autoAdvance(slideId);
    e.target.value = "";
  };

  // Add a user-entered URL to the slide's final export list. Accepts any
  // http(s) URL — no validation beyond that since the user has already
  // confirmed the image they want.
  const addCustomUrl = (slideId: number) => {
    const raw = (urlDrafts[slideId] || "").trim();
    if (!raw) return;
    if (!/^https?:\/\/\S+/i.test(raw)) return; // silently ignore malformed input
    setSlideMedia((prev) =>
      prev.map((sm) =>
        sm.slide_id === slideId && !sm.customUrls.includes(raw)
          ? { ...sm, customUrls: [...sm.customUrls, raw] }
          : sm,
      ),
    );
    setUrlDrafts((prev) => ({ ...prev, [slideId]: "" }));
  };

  const removeCustomUrl = (slideId: number, idx: number) => {
    setSlideMedia((prev) =>
      prev.map((sm) =>
        sm.slide_id === slideId
          ? { ...sm, customUrls: sm.customUrls.filter((_, i) => i !== idx) }
          : sm,
      ),
    );
  };

  // --- Export ---
  const buildExportLines = () => {
    return slides.map((slide) => {
      const sm = slideMedia.find((m) => m.slide_id === slide.id);
      // Use page_url (show page with credits) for export, fall back to full_url (CDN).
      // User-entered customUrls are appended to whichever source was selected.
      const selectedUrls = sm?.selected?.length
        ? sm.selected.map((s) => s.page_url || s.full_url)
        : sm?.custom?.url ? [sm.custom.url] : [];
      const mediaUrls = [...selectedUrls, ...(sm?.customUrls || [])];
      const duration = slide.estimated_duration_sec || 0;
      const timeRange = duration > 0 ? ` 0:00 to ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}` : "";
      return { text: slide.text, urls: mediaUrls, timeRange };
    });
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

  const handleExport = () => {
    const lines = buildExportLines();
    const content = lines.map((l) => `${l.text}\n${l.urls.map((u, i) => `  [${i + 1}] ${u}`).join("\n")}${l.timeRange}`).join("\n\n");
    triggerDownload(new Blob([content], { type: "text/plain" }), `media-sourcing-${Date.now()}.txt`);
    setPhase("export");
  };

  const handleExportJson = () => {
    const exportData = slides.map((slide) => {
      const sm = slideMedia.find((m) => m.slide_id === slide.id);
      return {
        slide_id: slide.id,
        slide_text: slide.text,
        subject: slide.subject,
        image_query: slide.image_query,
        ...(isVideoMode ? { video_query: slide.video_query, estimated_duration_sec: slide.estimated_duration_sec } : {}),
        selected_media: [
          ...(sm?.selected?.length
            ? sm.selected.map((s) => ({
                url: s.full_url,
                page_url: s.page_url || s.full_url,
                source: s.source,
                author: s.author,
                title: s.title,
              }))
            : sm?.custom
              ? [{ url: sm.custom.url, page_url: sm.custom.url, source: "Custom", author: "User upload" }]
              : []),
          // User-entered URLs — always appended, alongside whichever selection is active
          ...(sm?.customUrls || []).map((u) => ({
            url: u,
            page_url: u,
            source: "Custom URL",
            author: "User provided",
          })),
        ],
      };
    });
    triggerDownload(new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" }), `media-sourcing-${Date.now()}.json`);
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-gray-600"><ArrowLeft size={18} /></Link>
        <span className="font-bold text-base text-indigo-500">
          {isVideoMode ? "MSN Video Sourcing" : "MSN SS Sourcing"}
        </span>
        {phase === "selection" && (
          <span className="ml-auto text-xs text-gray-500">
            {selectedCount}/{slides.length} slides selected
          </span>
        )}
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* INPUT PHASE */}
        {phase === "input" && (
          <div className="space-y-4">
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-gray-900">Paste your article</h1>
              <p className="text-sm text-gray-500 mt-1">
                The AI will identify {isVideoMode ? "video segments" : "slides"} and generate targeted search queries for {isVideoMode ? "images and video footage" : "Imagn, Imago, and Google Images"}.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                <strong>Error: </strong>{error}
              </div>
            )}

            <Card>
              {/* Mode selector */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-600 mb-1.5">Sourcing type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSourcingMode("slideshow")}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      sourcingMode === "slideshow"
                        ? "border-indigo-300 bg-indigo-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ImageIcon size={15} className={sourcingMode === "slideshow" ? "text-indigo-600" : "text-gray-400"} />
                      <span className={`text-sm font-semibold ${sourcingMode === "slideshow" ? "text-indigo-700" : "text-gray-700"}`}>
                        MSN SS Sourcing
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 m-0">
                      Slideshow articles — images only. Breaks into slides, searches Google HD + Firecrawl.
                    </p>
                  </button>
                  <button
                    onClick={() => setSourcingMode("video")}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      sourcingMode === "video"
                        ? "border-indigo-300 bg-indigo-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Film size={15} className={sourcingMode === "video" ? "text-indigo-600" : "text-gray-400"} />
                      <span className={`text-sm font-semibold ${sourcingMode === "video" ? "text-indigo-700" : "text-gray-700"}`}>
                        MSN Video Sourcing
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 m-0">
                      Video scripts — images + video footage. Broadcast pacing, dual search queries per segment.
                    </p>
                  </button>
                </div>
              </div>

              <label className="block text-sm font-medium text-gray-600 mb-1.5">Article / Script</label>
              <Textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder={isVideoMode ? "Paste your MSN video script here..." : "Paste your MSN slideshow article text here..."}
                className="!min-h-[200px]"
              />
              <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">{wordCount > 0 ? `${wordCount} words` : "No content"}</span>
                  {!script && (
                    <Button variant="secondary" onClick={() => setScript(SAMPLE_SCRIPT)}>Load sample</Button>
                  )}
                  {script && <Button variant="secondary" onClick={() => setScript("")}>Clear</Button>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAllowNonLicensed(!allowNonLicensed)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                      allowNonLicensed
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    }`}
                    title={
                      allowNonLicensed
                        ? "Unrestricted search active. Stock agencies (Getty, Shutterstock) are included."
                        : "Strict licensing active. Stock agencies are filtered out."
                    }
                  >
                    <ShieldOff size={15} className={allowNonLicensed ? "text-amber-500" : "text-gray-400"} />
                    Non-Licensed
                  </button>
                  <Button disabled={script.trim().length <= 10} onClick={processScript}>
                    <FileText size={15} /> Process {isVideoMode ? "script" : "article"}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* PROCESSING */}
        {phase === "processing" && (
          <Card>
            <div className="flex flex-col items-center py-12 gap-4">
              <Spinner />
              <p className="font-semibold text-sm text-gray-900">Analyzing article and generating media queries...</p>
              <p className="text-xs text-gray-500">Identifying slides, subjects, and search keywords</p>
            </div>
          </Card>
        )}

        {/* SELECTION PHASE */}
        {phase === "selection" && (
          <div className="space-y-4">
            {/* Analysis card */}
            {analysis && (
              <Card className="!bg-indigo-50 !border-indigo-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 text-sm font-bold">AI</div>
                  <div>
                    <p className="text-sm font-semibold text-indigo-900 m-0">Article analysis</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <Badge variant="info">{(analysis.topic as string) || "Unknown"}</Badge>
                      <Badge variant="keyword">{(analysis.type as string) || "Article"}</Badge>
                      <Badge variant="duration">{(analysis.recency as string) || "Recent"}</Badge>
                    </div>
                    {(analysis.key_entities as string[])?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(analysis.key_entities as string[]).map((e, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white text-indigo-700 border border-indigo-200">{e}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="info">{selectedCount}/{slides.length} selected</Badge>
                <Button variant="secondary" onClick={() => { setPhase("input"); setSlides([]); }}>
                  <ArrowLeft size={13} /> New article
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={searchAll}><Search size={13} /> Search all</Button>
                <Button onClick={handleExport} disabled={!allSelected}>
                  <Download size={13} /> Export (.txt)
                </Button>
                <Button variant="secondary" onClick={handleExportJson} disabled={!allSelected}>
                  <FileText size={13} /> Export (.json)
                </Button>
              </div>
            </div>

            {/* Slide cards */}
            {slides.map((slide, idx) => {
              const sm = slideMedia.find((m) => m.slide_id === slide.id)!;
              const isExpanded = expandedSlide === slide.id;
              const hasSelection = (sm?.selected?.length ?? 0) > 0 || !!sm?.custom;

              return (
                <Card key={slide.id} flush className="overflow-hidden">
                  {/* Header */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => {
                      const next = isExpanded ? null : slide.id;
                      setExpandedSlide(next);
                      if (next && sm && !sm.searched) searchSlide(slide.id);
                    }}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      hasSelection ? "bg-green-100 text-green-700" : "bg-indigo-50 text-indigo-500"
                    }`}>
                      {hasSelection ? <Check size={13} /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 m-0 line-clamp-2">{slide.text}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge variant="keyword">{slide.image_query}</Badge>
                        {slide.subject && <Badge variant="info">{slide.subject}</Badge>}
                        {isVideoMode && slide.estimated_duration_sec && (
                          <Badge variant="duration">{slide.estimated_duration_sec}s</Badge>
                        )}
                        {hasSelection && (
                          <Badge variant="success">
                            {sm.selected.length > 0
                              ? `${sm.selected.length} selected`
                              : "Custom"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {hasSelection && (
                      <div className="flex gap-1 shrink-0">
                        {sm.selected.length > 0
                          ? sm.selected.map((sel) => (
                              <div key={sel.id} className="w-10 h-8 rounded overflow-hidden bg-gray-100">
                                <img src={sel.thumbnail} alt="" className="w-full h-full object-cover" />
                              </div>
                            ))
                          : sm.custom && (
                              <div className="w-14 h-10 rounded overflow-hidden bg-gray-100">
                                <img src={sm.custom.url} alt="" className="w-full h-full object-cover" />
                              </div>
                            )}
                      </div>
                    )}
                    {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </button>

                  {/* Expanded */}
                  {isExpanded && sm && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                      {/* Search */}
                      <div className="flex gap-2 mb-3">
                        {editingQuery === slide.id ? (
                          <div className="flex-1 flex gap-2">
                            <input
                              className="flex-1 px-3 py-2 text-sm text-gray-900 bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-200"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  setSlides((prev) => prev.map((s) => s.id === slide.id ? { ...s, image_query: editValue } : s));
                                  searchSlide(slide.id, editValue);
                                  setEditingQuery(null);
                                }
                                if (e.key === "Escape") setEditingQuery(null);
                              }}
                            />
                            <Button variant="secondary" onClick={() => {
                              setSlides((prev) => prev.map((s) => s.id === slide.id ? { ...s, image_query: editValue } : s));
                              searchSlide(slide.id, editValue);
                              setEditingQuery(null);
                            }}><Check size={13} /></Button>
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                            <Search size={14} className="text-gray-400" />
                            <span className="text-sm text-gray-700 flex-1">{slide.image_query}</span>
                            <button
                              onClick={() => { setEditingQuery(slide.id); setEditValue(slide.image_query); }}
                              className="text-gray-400 hover:text-indigo-500"
                            ><Pencil size={13} /></button>
                          </div>
                        )}
                        <Button variant="secondary" onClick={() => searchSlide(slide.id)} disabled={sm.loading}>
                          <RefreshCw size={13} className={sm.loading ? "animate-spin" : ""} />
                        </Button>
                      </div>

                      {/* Results — one column per source, with skeletons for sources still loading */}
                      {sm.searched && (
                        <>
                          {/* Selection counter */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <ImageIcon size={13} className="text-indigo-500" />
                            <span className="text-xs font-semibold text-gray-700">{sm.images.length} images</span>
                            <span className="text-[10px] text-gray-400 ml-1">Select 1–3 images</span>
                            {sm.selected.length > 0 && (
                              <Badge variant="success">{sm.selected.length}/3 selected</Badge>
                            )}
                            {sm.loading && (
                              <span className="text-[10px] text-indigo-500 flex items-center gap-1 ml-auto">
                                <Spinner size={10} />
                                {Object.values(sm.sourceStatus).filter((s) => s === "loading").length} source(s) loading…
                              </span>
                            )}
                          </div>

                          {/* Source columns — one per configured source */}
                          <div className="flex gap-3 overflow-x-auto pb-2 max-h-[480px]">
                            {(() => {
                              const groups: Record<string, MediaResult[]> = {};
                              for (const img of sm.images) {
                                if (!groups[img.source]) groups[img.source] = [];
                                groups[img.source].push(img);
                              }

                              const sourceColors: Record<string, string> = {
                                Imagn: "bg-orange-500",
                                Imago: "bg-purple-500",
                                Google: "bg-blue-500",
                                "Google CC": "bg-cyan-500",
                                Firecrawl: "bg-amber-500",
                                Pexels: "bg-emerald-500",
                              };

                              return IMAGE_SOURCES.map((source) => {
                                const imgs = groups[source] || [];
                                const status = sm.sourceStatus[source] ?? "idle";
                                const isLoading = status === "loading";
                                const isError = status === "error";
                                return (
                                  <div key={source} className="flex-shrink-0" style={{ minWidth: "140px", maxWidth: "180px" }}>
                                    {/* Source header */}
                                    <div className="flex items-center gap-1.5 mb-1.5 sticky top-0 bg-white z-10 pb-1">
                                      <span className={`w-2 h-2 rounded-full ${sourceColors[source] || "bg-gray-400"} ${isLoading ? "animate-pulse" : ""}`} />
                                      <span className="text-[11px] font-bold text-gray-800 truncate">{source}</span>
                                      {isLoading ? (
                                        <Spinner size={10} />
                                      ) : isError ? (
                                        <span className="text-[9px] text-red-400">error</span>
                                      ) : (
                                        <span className="text-[9px] text-gray-400">{imgs.length}</span>
                                      )}
                                    </div>
                                    {/* Skeletons while loading, or images once done */}
                                    <div className="space-y-1.5 overflow-y-auto max-h-[420px] pr-0.5">
                                      {isLoading && imgs.length === 0 ? (
                                        Array.from({ length: 4 }).map((_, i) => (
                                          <div key={i} className="rounded-lg overflow-hidden border-2 border-transparent">
                                            <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
                                            <div className="px-1 py-0.5">
                                              <div className="h-2 w-3/4 bg-gray-100 rounded animate-pulse" />
                                            </div>
                                          </div>
                                        ))
                                      ) : !isLoading && imgs.length === 0 ? (
                                        <div className="text-[10px] text-gray-400 text-center py-4">
                                          {isError ? "Failed" : "No results"}
                                        </div>
                                      ) : (
                                        imgs.map((img) => {
                                          const selIdx = sm.selected.findIndex((s) => s.id === img.id);
                                          const isSelected = selIdx >= 0;
                                          const sourceUrl = img.page_url || img.full_url;
                                          return (
                                            <div
                                              key={img.id}
                                              className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                                                isSelected ? "border-indigo-500 shadow-md ring-1 ring-indigo-300" : "border-transparent hover:border-gray-300"
                                              }`}
                                            >
                                              <div
                                                className="aspect-[4/3] bg-gray-100 cursor-pointer"
                                                onClick={() => selectMedia(slide.id, img)}
                                              >
                                                <img
                                                  src={img.thumbnail} alt={img.title || img.source}
                                                  className="w-full h-full object-cover" loading="lazy"
                                                  onError={(e) => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${img.id}/400/300`; }}
                                                />
                                              </div>
                                              {img.width >= 1920 && (
                                                <div className="absolute top-1 left-1">
                                                  <span className="px-1 py-0.5 rounded text-[8px] font-semibold bg-green-500/80 text-white">HD</span>
                                                </div>
                                              )}
                                              {isSelected && (
                                                <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">
                                                  {selIdx + 1}
                                                </div>
                                              )}
                                              <div className="px-1 py-0.5 flex items-center gap-1">
                                                <p className="text-[8px] text-gray-600 truncate m-0 flex-1">{img.title || img.author}</p>
                                                <a
                                                  href={sourceUrl}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="shrink-0 p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-indigo-500 transition-colors"
                                                  title="Open source page (verify credits)"
                                                >
                                                  <ExternalLink size={10} />
                                                </a>
                                              </div>
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>

                          {/* Videos row (video mode only) */}
                          {isVideoMode && (sm.videos.length > 0 || sm.sourceStatus["Google Video"] === "loading") && (
                                <div className="mt-3 pt-3 border-t border-gray-100">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Film size={13} className="text-red-500" />
                                    <span className="text-xs font-semibold text-gray-700">{sm.videos.length} videos</span>
                                    {sm.sourceStatus["Google Video"] === "loading" && <Spinner size={10} />}
                                  </div>
                                  <div className="grid grid-cols-4 gap-1.5 max-h-[200px] overflow-y-auto pr-1">
                                    {sm.sourceStatus["Google Video"] === "loading" && sm.videos.length === 0 &&
                                      Array.from({ length: 4 }).map((_, i) => (
                                        <div key={`vs-${i}`} className="rounded-lg overflow-hidden">
                                          <div className="aspect-video bg-gray-100 animate-pulse" />
                                        </div>
                                      ))}
                                    {sm.videos.map((vid) => {
                                      const isSelected = sm.selected.some((s) => s.id === vid.id);
                                      const vidUrl = vid.page_url || vid.full_url;
                                      return (
                                        <div
                                          key={vid.id}
                                          className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                                            isSelected ? "border-indigo-500 shadow-md" : "border-transparent hover:border-gray-300"
                                          }`}
                                        >
                                          <div
                                            className="aspect-video bg-gray-100 cursor-pointer"
                                            onClick={() => selectMedia(slide.id, vid)}
                                          >
                                            <img
                                              src={vid.thumbnail} alt={vid.title || "Video"}
                                              className="w-full h-full object-cover" loading="lazy"
                                              onError={(e) => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${vid.id}/400/225`; }}
                                            />
                                          </div>
                                          <div className="absolute top-1 left-1">
                                            <span className="px-1 py-0.5 rounded text-[8px] font-semibold bg-red-500/80 text-white">{vid.source}</span>
                                          </div>
                                          {isSelected && (
                                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                                              <Check size={9} className="text-white" />
                                            </div>
                                          )}
                                          <div className="px-1 py-0.5 flex items-center gap-1">
                                            <p className="text-[8px] text-gray-600 truncate m-0 flex-1">{vid.title || vid.author}</p>
                                            <a
                                              href={vidUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              onClick={(e) => e.stopPropagation()}
                                              className="shrink-0 p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-indigo-500 transition-colors"
                                              title="Open source page"
                                            >
                                              <ExternalLink size={10} />
                                            </a>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                        </>
                      )}

                      {/* Upload / URL input / clear */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 mt-2">
                        <input
                          ref={(el) => { uploadRefs.current[slide.id] = el; }}
                          type="file" accept="image/*" className="hidden"
                          onChange={(e) => handleUpload(slide.id, e)}
                        />
                        <Button variant="secondary" onClick={() => uploadRefs.current[slide.id]?.click()}>
                          <Upload size={13} /> Upload
                        </Button>
                        {/* Paste an image URL to include in the final output */}
                        <div className="flex items-center gap-1 flex-1 min-w-[200px]">
                          <input
                            type="url"
                            placeholder="Paste image URL to include"
                            value={urlDrafts[slide.id] || ""}
                            onChange={(e) => setUrlDrafts((p) => ({ ...p, [slide.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomUrl(slide.id); } }}
                            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                          <Button variant="secondary" onClick={() => addCustomUrl(slide.id)}>
                            <LinkIcon size={13} /> Add URL
                          </Button>
                        </div>
                        {hasSelection && (
                          <button
                            onClick={() => setSlideMedia((prev) =>
                              prev.map((sm2) => sm2.slide_id === slide.id ? { ...sm2, selected: [], custom: null } : sm2)
                            )}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                          ><X size={14} /></button>
                        )}
                        {sm.custom && (
                          <span className="text-xs text-indigo-600 flex items-center gap-1">
                            <Check size={12} /> {sm.custom.name}
                          </span>
                        )}
                      </div>

                      {/* Added custom URLs — chips with delete */}
                      {sm.customUrls.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {sm.customUrls.map((u, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs rounded px-2 py-1 max-w-full"
                              title={u}
                            >
                              <LinkIcon size={11} />
                              <span className="truncate max-w-[240px]">{u}</span>
                              <button
                                onClick={() => removeCustomUrl(slide.id, idx)}
                                className="text-indigo-400 hover:text-red-500"
                                aria-label="Remove URL"
                              ><X size={11} /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* EXPORT COMPLETE */}
        {phase === "export" && (
          <Card>
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <Check size={28} className="text-green-600" />
              </div>
              <p className="font-semibold text-lg text-gray-900">Media list exported!</p>
              <p className="text-sm text-gray-500">{slides.length} slides with selected media URLs</p>
              <div className="flex gap-3">
                <Button onClick={() => { setPhase("selection"); }}>← Back to selection</Button>
                <Button variant="secondary" onClick={() => { setPhase("input"); setSlides([]); setSlideMedia([]); }}>
                  New article
                </Button>
              </div>
            </div>

            {/* Script + URL preview */}
            <div className="border-t border-gray-100 pt-4 mt-2">
              <h4 className="text-xs font-semibold text-gray-600 mb-3">Script with media URLs</h4>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {buildExportLines().map((line, i) => (
                  <div key={i} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                    <p className="text-sm text-gray-800 leading-relaxed">{line.text}</p>
                    {line.urls.length > 0 ? (
                      <div className="mt-1 space-y-0.5">
                        {line.urls.map((url, j) => (
                          <a
                            key={j}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-500 hover:text-indigo-700 block truncate"
                          >
                            [{j + 1}] {url}{j === 0 ? line.timeRange : ""}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 mt-1 block">No media selected</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <Button variant="secondary" onClick={handleExport}>
                  <Download size={12} /> Download .txt
                </Button>
                <Button variant="secondary" onClick={handleExportJson}>
                  <FileText size={12} /> Download .json
                </Button>
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}