// src/components/pipeline/SegmentEditor.tsx
"use client";

import { useState, useCallback } from "react";
import { Card, Button, Badge } from "@/components/ui";
import type { Segment, SegmentationResult } from "@/lib/pipeline-store";
import {
  GripVertical,
  Scissors,
  Merge,
  Trash2,
  Plus,
  RotateCcw,
  Check,
  ChevronUp,
  ChevronDown,
  Pencil,
} from "lucide-react";

function recalcSegment(seg: Segment, newId: number): Segment {
  const wc = seg.text.trim().split(/\s+/).filter(Boolean).length;
  return {
    ...seg,
    id: newId,
    word_count: wc,
    estimated_duration_sec: Math.round((wc / 2.5) * 10) / 10,
  };
}

function renumber(segs: Segment[]): Segment[] {
  return segs.map((s, i) => recalcSegment(s, i + 1));
}

function calcTotals(segs: Segment[]): { total_duration_sec: number; segment_count: number } {
  return {
    segment_count: segs.length,
    total_duration_sec: Math.round(segs.reduce((a, s) => a + s.estimated_duration_sec, 0) * 10) / 10,
  };
}

type EditingField = { segId: number; field: "text" | "keyword" } | null;

export default function SegmentEditor({
  initialSegments,
  onComplete,
  onBack,
}: {
  initialSegments: SegmentationResult;
  onComplete: (result: SegmentationResult) => void;
  onBack: () => void;
}) {
  const [segments, setSegments] = useState<Segment[]>(
    () => [...initialSegments.segments]
  );
  const [original] = useState<Segment[]>(() => [...initialSegments.segments]);
  const [editing, setEditing] = useState<EditingField>(null);
  const [editValue, setEditValue] = useState("");
  const [splitCursor, setSplitCursor] = useState<number | null>(null);
  const [splitPos, setSplitPos] = useState(0);

  const hasChanges = JSON.stringify(segments) !== JSON.stringify(original);
  const totals = calcTotals(segments);

  // --- Editing text / keyword inline ---
  const startEdit = (segId: number, field: "text" | "keyword") => {
    const seg = segments.find((s) => s.id === segId);
    if (!seg) return;
    setEditing({ segId, field });
    setEditValue(field === "text" ? seg.text : seg.image_query || seg.keyword);
  };

  const commitEdit = () => {
    if (!editing) return;
    setSegments((prev) =>
      renumber(
        prev.map((s) => {
          if (s.id !== editing.segId) return s;
          if (editing.field === "keyword") {
            // Update keyword, image_query, and video_query together
            const newKeyword = editValue.trim() || s.keyword;
            return recalcSegment(
              {
                ...s,
                keyword: newKeyword,
                image_query: newKeyword,
                video_query: `${newKeyword} footage highlights`,
              },
              s.id
            );
          }
          return recalcSegment(
            { ...s, [editing.field]: editValue.trim() || s[editing.field] },
            s.id
          );
        })
      )
    );
    setEditing(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditValue("");
  };

  // --- Split ---
  const openSplit = (segId: number) => {
    setSplitCursor(segId);
    const seg = segments.find((s) => s.id === segId);
    if (seg) {
      const mid = Math.floor(seg.text.length / 2);
      const spaceAfter = seg.text.indexOf(" ", mid);
      const spaceBefore = seg.text.lastIndexOf(" ", mid);
      setSplitPos(
        spaceAfter !== -1
          ? spaceAfter
          : spaceBefore !== -1
          ? spaceBefore
          : mid
      );
    }
  };

  const confirmSplit = () => {
    if (splitCursor === null) return;
    setSegments((prev) => {
      const idx = prev.findIndex((s) => s.id === splitCursor);
      if (idx === -1) return prev;
      const seg = prev[idx];
      const t1 = seg.text.slice(0, splitPos).trim();
      const t2 = seg.text.slice(splitPos).trim();
      if (!t1 || !t2) return prev;

      const seg1: Segment = {
        ...seg,
        text: t1,
        word_count: t1.split(/\s+/).length,
        estimated_duration_sec: Math.round((t1.split(/\s+/).length / 2.5) * 10) / 10,
        image_query: seg.image_query || seg.keyword,
        video_query: seg.video_query || seg.keyword,
      };
      const seg2: Segment = {
        ...seg,
        id: seg.id + 1,
        text: t2,
        word_count: t2.split(/\s+/).length,
        estimated_duration_sec: Math.round((t2.split(/\s+/).length / 2.5) * 10) / 10,
        image_query: seg.image_query || seg.keyword,
        video_query: seg.video_query || seg.keyword,
      };

      const next = [...prev];
      next.splice(idx, 1, seg1, seg2);
      return renumber(next);
    });
    setSplitCursor(null);
  };

  // --- Merge with next ---
  const mergeWithNext = (segId: number) => {
    setSegments((prev) => {
      const idx = prev.findIndex((s) => s.id === segId);
      if (idx === -1 || idx >= prev.length - 1) return prev;
      const merged: Segment = {
        ...prev[idx],
        text: prev[idx].text.trimEnd() + " " + prev[idx + 1].text.trimStart(),
        keyword: prev[idx].keyword, // keep first segment's keyword
        fallback_from_previous: prev[idx].fallback_from_previous,
      };
      const next = [...prev];
      next.splice(idx, 2, recalcSegment(merged, idx + 1));
      return renumber(next);
    });
  };

  // --- Move up / down ---
  const moveSegment = (segId: number, dir: -1 | 1) => {
    setSegments((prev) => {
      const idx = prev.findIndex((s) => s.id === segId);
      const target = idx + dir;
      if (idx === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return renumber(next);
    });
  };

  // --- Delete ---
  const deleteSegment = (segId: number) => {
    setSegments((prev) => renumber(prev.filter((s) => s.id !== segId)));
  };

  // --- Add blank segment ---
  const addSegment = (afterIdx: number) => {
    setSegments((prev) => {
      const prevSeg = prev[afterIdx];
      const newSeg: Segment = {
        id: 0,
        text: "New segment text...",
        keyword: prevSeg?.keyword || "keyword",
        image_query: prevSeg?.image_query || prevSeg?.keyword || "general image",
        video_query: prevSeg?.video_query || prevSeg?.keyword || "general footage",
        fallback_from_previous: true,
        word_count: 3,
        estimated_duration_sec: 1.2,
      };
      const next = [...prev];
      next.splice(afterIdx + 1, 0, newSeg);
      return renumber(next);
    });
  };

  // --- Reset ---
  const resetAll = () => {
    setSegments([...original]);
    setEditing(null);
    setSplitCursor(null);
  };

  // --- Save & proceed ---
  const handleSave = async () => {
    const result: SegmentationResult = {
      segments,
      ...totals,
    };
    // Save to server
    try {
      await fetch("/api/save-segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
    } catch {
      // continue anyway — data is in local state
    }
    onComplete(result);
  };

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Badge variant="info">{totals.segment_count} segments</Badge>
          <Badge variant="duration">{totals.total_duration_sec}s total</Badge>
          {hasChanges && <Badge variant="fallback">unsaved changes</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={resetAll} disabled={!hasChanges}>
            <RotateCcw size={13} /> Reset
          </Button>
          <Button variant="secondary" onClick={onBack}>
            ← Back
          </Button>
          <Button onClick={handleSave}>
            Save & continue →
          </Button>
        </div>
      </div>

      {/* Segments */}
      {segments.map((seg, idx) => {
        const isEditing = editing?.segId === seg.id;
        const isSplitting = splitCursor === seg.id;

        return (
          <div key={`${seg.id}-${idx}`}>
            <Card className="!p-0 overflow-hidden">
              <div className="flex items-stretch">
                {/* Left: grip + number */}
                <div className="flex flex-col items-center justify-center w-12 bg-gray-50 border-r border-gray-100 shrink-0 gap-1 py-3">
                  <GripVertical size={14} className="text-gray-300" />
                  <span className="text-xs font-bold text-indigo-500">
                    {idx + 1}
                  </span>
                  <div className="flex flex-col gap-0.5 mt-1">
                    <button
                      onClick={() => moveSegment(seg.id, -1)}
                      disabled={idx === 0}
                      className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-20"
                    >
                      <ChevronUp size={12} className="text-gray-500" />
                    </button>
                    <button
                      onClick={() => moveSegment(seg.id, 1)}
                      disabled={idx === segments.length - 1}
                      className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-20"
                    >
                      <ChevronDown size={12} className="text-gray-500" />
                    </button>
                  </div>
                </div>

                {/* Center: content */}
                <div className="flex-1 p-4 min-w-0">
                  {/* Text row */}
                  {isEditing && editing.field === "text" ? (
                    <div className="flex gap-2">
                      <textarea
                        className="flex-1 p-2 text-sm text-gray-900 bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none leading-relaxed"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        rows={2}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            commitEdit();
                          }
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={commitEdit}
                          className="p-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className="text-sm leading-relaxed m-0 text-gray-900 cursor-pointer hover:bg-indigo-50 rounded px-1.5 py-1 -mx-1.5 -my-1 transition-colors group"
                      onClick={() => startEdit(seg.id, "text")}
                    >
                      {seg.text}
                      <Pencil
                        size={11}
                        className="inline ml-2 text-gray-300 group-hover:text-indigo-400 transition-colors"
                      />
                    </p>
                  )}

                  {/* Split UI */}
                  {isSplitting && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xs font-medium text-amber-800 mb-2">
                        Drag the slider to choose where to split:
                      </p>
                      <input
                        type="range"
                        min={1}
                        max={seg.text.length - 1}
                        value={splitPos}
                        onChange={(e) => setSplitPos(Number(e.target.value))}
                        className="w-full mb-2"
                      />
                      <div className="flex gap-2 text-xs">
                        <span className="flex-1 p-2 bg-white rounded border border-amber-200 text-gray-700">
                          {seg.text.slice(0, splitPos)}
                          <span className="text-amber-500 font-bold">|</span>
                        </span>
                        <span className="flex-1 p-2 bg-white rounded border border-amber-200 text-gray-700">
                          {seg.text.slice(splitPos)}
                        </span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button
                          variant="primary"
                          className="!text-xs !py-1.5 !px-3"
                          onClick={confirmSplit}
                        >
                          Split here
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => setSplitCursor(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Badges row */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    {/* Keyword — editable */}
                    {isEditing && editing.field === "keyword" ? (
                      <div className="flex items-center gap-1">
                        <input
                          className="px-2 py-0.5 text-xs text-gray-900 bg-white border border-indigo-300 rounded-full w-40 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          autoFocus
                          placeholder="Image search query"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                        <button onClick={commitEdit} className="text-indigo-500 hover:text-indigo-700">
                          <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(seg.id, "keyword")}
                        className="hover:opacity-80 transition-opacity"
                        title="Click to edit search queries"
                      >
                        <Badge variant="keyword">
                          Keyword: {seg.image_query || seg.keyword}
                          <Pencil size={9} className="inline ml-1 opacity-40" />
                        </Badge>
                      </button>
                    )}
                    <Badge variant="duration">{seg.estimated_duration_sec}s</Badge>
                    <Badge variant="words">{seg.word_count}w</Badge>
                    {seg.word_count > 12 && (
                      <Badge variant="fallback">long — consider splitting</Badge>
                    )}
                    {seg.word_count < 3 && (
                      <Badge variant="fallback">short — consider merging</Badge>
                    )}
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex flex-col gap-1 p-2 border-l border-gray-100 justify-center shrink-0">
                  <button
                    onClick={() => openSplit(seg.id)}
                    className="p-1.5 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors"
                    title="Split segment"
                  >
                    <Scissors size={14} />
                  </button>
                  {idx < segments.length - 1 && (
                    <button
                      onClick={() => mergeWithNext(seg.id)}
                      className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Merge with next"
                    >
                      <Merge size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => deleteSegment(seg.id)}
                    className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete segment"
                    disabled={segments.length <= 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </Card>

            {/* Add segment button between cards */}
            <div className="flex justify-center -my-1.5 relative z-10">
              <button
                onClick={() => addSegment(idx)}
                className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-300 hover:text-indigo-500 hover:border-indigo-300 transition-colors shadow-sm"
                title="Add segment here"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        );
      })}

      {/* Bottom action bar */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="secondary" onClick={onBack}>
          ← Back to script
        </Button>
        <Button onClick={handleSave}>Save & continue to voiceover →</Button>
      </div>
    </div>
  );
}