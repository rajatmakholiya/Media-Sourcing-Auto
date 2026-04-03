// src/app/tools/media-sourcing/page.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { Card, Button, Badge, Spinner, Textarea } from "@/components/ui";
import {
  Search, Check, X, Upload, Link as LinkIcon, ChevronDown, ChevronUp,
  RefreshCw, Download, ArrowLeft, Image as ImageIcon, FileText, Pencil, Film,
} from "lucide-react";

type SourcingMode = "slideshow" | "video";

type Slide = {
  id: number;
  text: string;
  image_query: string;
  video_query?: string;
  subject: string;
  estimated_duration_sec?: number;
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

type SlideMedia = {
  slide_id: number;
  images: MediaResult[];
  videos: MediaResult[];
  selected: MediaResult | null;
  selectedVideo: MediaResult | null;
  custom: { url: string; name: string } | null;
  loading: boolean;
  searched: boolean;
};

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
  const uploadRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const selectedCount = slideMedia.filter((sm) => sm.selected || sm.custom).length;
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
          selected: null,
          selectedVideo: null,
          custom: null,
          loading: false,
          searched: false,
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
  const searchSlide = useCallback(async (slideId: number, query?: string, slidesOverride?: Slide[]) => {
    const currentSlides = slidesOverride || slides;
    const slide = currentSlides.find((s) => s.id === slideId);
    const q = query || slide?.image_query || "";

    setSlideMedia((prev) =>
      prev.map((sm) => (sm.slide_id === slideId ? { ...sm, loading: true } : sm))
    );

    try {
      const resp = await fetch("/api/media-sourcing/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          video_query: slide?.video_query || q,
          slide_id: slideId,
          mode: isVideoMode ? "video" : "slideshow",
        }),
      });
      if (!resp.ok) throw new Error("Search failed");
      const data = await resp.json();

      setSlideMedia((prev) =>
        prev.map((sm) =>
          sm.slide_id === slideId
            ? { ...sm, images: data.images || [], videos: data.videos || [], loading: false, searched: true }
            : sm
        )
      );
    } catch {
      setSlideMedia((prev) =>
        prev.map((sm) => (sm.slide_id === slideId ? { ...sm, loading: false, searched: true } : sm))
      );
    }
  }, [slides, isVideoMode]);

  const searchAll = useCallback(async () => {
    for (const slide of slides) {
      await searchSlide(slide.id, slide.image_query);
    }
  }, [slides, searchSlide]);

  const selectMedia = (slideId: number, media: MediaResult) => {
    setSlideMedia((prev) =>
      prev.map((sm) => (sm.slide_id === slideId ? { ...sm, selected: media, custom: null } : sm))
    );
    autoAdvance(slideId);
  };

  const autoAdvance = (currentId: number) => {
    const idx = slides.findIndex((s) => s.id === currentId);
    for (let i = idx + 1; i < slides.length; i++) {
      const sm = slideMedia.find((m) => m.slide_id === slides[i].id);
      if (sm && !sm.selected && !sm.custom) {
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
        sm.slide_id === slideId ? { ...sm, selected: null, custom: { url: URL.createObjectURL(file), name: file.name } } : sm
      )
    );
    autoAdvance(slideId);
    e.target.value = "";
  };

  // --- Export ---
  const buildExportLines = () => {
    return slides.map((slide) => {
      const sm = slideMedia.find((m) => m.slide_id === slide.id);
      const mediaUrl = sm?.selected?.full_url || sm?.custom?.url || "";
      const duration = slide.estimated_duration_sec || 0;
      const timeRange = duration > 0 ? ` 0:00 to ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}` : "";
      return { text: slide.text, url: mediaUrl, timeRange };
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
    const content = lines.map((l) => `${l.text}\n${l.url}${l.timeRange}`).join("\n\n");
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
        selected_media: sm?.selected
          ? { url: sm.selected.full_url, source: sm.selected.source, author: sm.selected.author, title: sm.selected.title }
          : sm?.custom
          ? { url: sm.custom.url, source: "Custom", author: "User upload" }
          : null,
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
                <Button disabled={script.trim().length <= 10} onClick={processScript}>
                  <FileText size={15} /> Process {isVideoMode ? "script" : "article"}
                </Button>
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
              const hasSelection = !!sm?.selected || !!sm?.custom;

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
                          <Badge variant="success">{sm.selected?.source || "Custom"}</Badge>
                        )}
                      </div>
                    </div>
                    {hasSelection && (
                      <div className="w-14 h-10 rounded overflow-hidden bg-gray-100 shrink-0">
                        <img src={sm.selected?.thumbnail || sm.custom?.url || ""} alt="" className="w-full h-full object-cover" />
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

                      {/* Loading */}
                      {sm.loading && (
                        <div className="flex items-center justify-center py-8 gap-3">
                          <Spinner size={24} />
                          <span className="text-sm text-gray-500">Searching Google & Firecrawl...</span>
                        </div>
                      )}

                      {/* Results */}
                      {!sm.loading && sm.searched && (
                        <>
                          {sm.images.length === 0 && sm.videos.length === 0 ? (
                            <div className="text-center py-6 text-sm text-gray-400">No results found. Try editing the search query.</div>
                          ) : (
                            <div className={`mb-3 ${isVideoMode && sm.videos.length > 0 ? "grid grid-cols-2 gap-4" : ""}`}>
                              {/* Images column */}
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <ImageIcon size={13} className="text-indigo-500" />
                                  <span className="text-xs font-semibold text-gray-700">{sm.images.length} images</span>
                                  <span className="text-[10px] text-gray-400">
                                    ({sm.images.filter(i => i.source === "Google").length} Google, {sm.images.filter(i => i.source === "Firecrawl").length} Firecrawl)
                                  </span>
                                </div>
                                <div className={`grid ${isVideoMode ? "grid-cols-3" : "grid-cols-5"} gap-1.5 max-h-[420px] overflow-y-auto pr-1`}>
                                  {sm.images.map((img) => {
                                    const isSelected = sm.selected?.id === img.id;
                                    return (
                                      <div
                                        key={img.id}
                                        onClick={() => selectMedia(slide.id, img)}
                                        className={`relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                                          isSelected ? "border-indigo-500 shadow-md" : "border-transparent hover:border-gray-300"
                                        }`}
                                      >
                                        <div className="aspect-[4/3] bg-gray-100">
                                          <img
                                            src={img.thumbnail} alt={img.title || img.source}
                                            className="w-full h-full object-cover" loading="lazy"
                                            onError={(e) => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${img.id}/400/300`; }}
                                          />
                                        </div>
                                        <div className="absolute top-1 left-1 flex gap-0.5">
                                          <span className="px-1 py-0.5 rounded text-[8px] font-semibold bg-black/60 text-white">{img.source}</span>
                                          {img.width >= 1920 && (
                                            <span className="px-1 py-0.5 rounded text-[8px] font-semibold bg-green-500/80 text-white">HD</span>
                                          )}
                                        </div>
                                        {isSelected && (
                                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                                            <Check size={9} className="text-white" />
                                          </div>
                                        )}
                                        <div className="px-1 py-0.5">
                                          <p className="text-[8px] text-gray-600 truncate m-0">{img.title || img.author}</p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Videos column (video mode only) */}
                              {isVideoMode && sm.videos.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <Film size={13} className="text-red-500" />
                                    <span className="text-xs font-semibold text-gray-700">{sm.videos.length} videos</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5 max-h-[420px] overflow-y-auto pr-1">
                                    {sm.videos.map((vid) => {
                                      const isSelected = sm.selected?.id === vid.id;
                                      return (
                                        <div
                                          key={vid.id}
                                          onClick={() => selectMedia(slide.id, vid)}
                                          className={`relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                                            isSelected ? "border-indigo-500 shadow-md" : "border-transparent hover:border-gray-300"
                                          }`}
                                        >
                                          <div className="aspect-video bg-gray-100">
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
                                          <div className="px-1 py-0.5">
                                            <p className="text-[8px] text-gray-600 truncate m-0">{vid.title || vid.author}</p>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {/* Upload / clear */}
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-2">
                        <input
                          ref={(el) => { uploadRefs.current[slide.id] = el; }}
                          type="file" accept="image/*" className="hidden"
                          onChange={(e) => handleUpload(slide.id, e)}
                        />
                        <Button variant="secondary" onClick={() => uploadRefs.current[slide.id]?.click()}>
                          <Upload size={13} /> Upload
                        </Button>
                        {hasSelection && (
                          <button
                            onClick={() => setSlideMedia((prev) =>
                              prev.map((sm2) => sm2.slide_id === slide.id ? { ...sm2, selected: null, custom: null } : sm2)
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
                    {line.url ? (
                      <a
                        href={line.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-500 hover:text-indigo-700 mt-1 block truncate"
                      >
                        {line.url}{line.timeRange}
                      </a>
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