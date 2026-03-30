// src/components/pipeline/ScriptInput.tsx
"use client";

import { useState, useCallback } from "react";
import { Card, Button, Textarea, Badge, Spinner } from "@/components/ui";
import type { SegmentationResult } from "@/lib/pipeline-store";

const SAMPLE_SCRIPT = `With the NFL Draft clock ticking, Wednesday’s pro day circuit saw future stars solidify their stock and sleepers emerge from the shadows. While a dozen potential draftees at Texas A&M commanded a large crowd of scouts, it was a versatile athlete at Nebraska who may have made the biggest leap of the day.Texas A&M: Aggies Showcase DepthA massive contingent of NFL personnel attended the Aggies' workout, as the program features nearly a dozen players expected to be drafted, including three potential first-rounders.KC Concepcion (WR/RS): A projected first-round pick, Concepcion did not participate in the workout following a minor "routine and preventative" knee procedure three weeks ago. However, his draft stock remains high. He has already completed "Top 30" visits with the Patriots, Ravens, and Titans, with meetings scheduled for the 49ers, Browns, and Dolphins. He is currently projected to go between picks 28 and 38.Tyler Onyedim (DL): After skipping the combine drills, Onyedim clocked a 4.92-second 40-yard dash. He looked fluid in position drills run by the New England Patriots. Drawing comparisons to fellow Aggie alum Nnamdi Madubuike, Onyedim met with the Patriots, Cowboys, and Jets, and spent significant time with the Saints following the workout.Le’Veon Moss (RB): Still recovering from a recent tightrope ankle procedure, Moss posted a respectable 4.58 in the 40-yard dash. Despite durability concerns throughout his college career, his explosiveness earns him third-round grades. He had dinner with the Cowboys and met extensively with the Dolphins.Nate Boerkircher (TE): After a limited combine due to a calf injury, the 6'5", 245-pound tight end posted a 4.78-second 40-yard dash and caught the ball well in drills. He met with the Bengals and had dinner with the Cowboys prior to the event.Nebraska: Sleepers and SpecialistsWhile the crowd in Lincoln was smaller than in College Station, several Huskers made a compelling case for the later rounds of the draft.Emmett Johnson (RB): The Big Ten Running Back of the Year improved his combine numbers, timing between 4.46 and 4.53 seconds in the 40-yard dash (up from a 4.56 in Indy). The Saints and Cowboys had running backs coaches on hand specifically to watch his receiving drills.DeShon Singleton (S): A physical specimen at 6'3" and 205 lbs, Singleton impressed with a 39.5-inch vertical and a 10-foot-10 broad jump. While he previously mentioned a move to linebacker, NFL teams—specifically the Bengals, Saints, and Titans—view him strictly as a zone or strong safety.Note: The Titans' interest is notable given new head coach Robert Saleh’s history with hybrid defenders like Jamien Sherwood.Heinrich Haarberg (TE): The standout of the day, the former quarterback turned tight end measured nearly 6'5" and 237 lbs. He posted a 4.51-second 40-yard dash, a 38-inch vertical, and a 4.15 short shuttle. Currently a developmental "freak athlete" prospect, he is drawing significant interest from the Buffalo Bills.`;

const LOADING_MESSAGES = [
  "Reading your script...",
  "Finding natural break points...",
  "Extracting visual keywords...",
  "Estimating segment timing...",
  "Packaging results...",
];

type Phase = "input" | "processing" | "result" | "error";

export default function ScriptInput({
  segments,
  onComplete,
}: {
  segments: SegmentationResult | null;
  onComplete: (result: SegmentationResult) => void;
}) {
  const [script, setScript] = useState("");
  const [phase, setPhase] = useState<Phase>(segments ? "result" : "input");
  const [result, setResult] = useState<SegmentationResult | null>(segments);
  const [error, setError] = useState("");
  const [loadMsg, setLoadMsg] = useState("");

  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const estDuration = (wordCount / 2.5).toFixed(0);

  const runSegmentation = useCallback(async () => {
    setPhase("processing");
    setError("");
    setLoadMsg(LOADING_MESSAGES[0]);

    let msgIdx = 0;
    const interval = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, LOADING_MESSAGES.length - 1);
      setLoadMsg(LOADING_MESSAGES[msgIdx]);
    }, 2000);

    try {
      const resp = await fetch("/api/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });

      clearInterval(interval);

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData?.error || `Server error ${resp.status}`);
      }

      const data: SegmentationResult = await resp.json();
      setResult(data);
      setPhase("result");
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("error");
    }
  }, [script]);

  const reset = () => {
    setPhase("input");
    setResult(null);
    setError("");
  };

  // --- INPUT / ERROR ---
  if (phase === "input" || phase === "error") {
    return (
      <div className="space-y-4">
        <Card>
          {phase === "error" && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
              <strong>Segmentation failed: </strong>{error}
              <p className="mt-1 text-xs text-red-600">
                {error.toLowerCase().includes("overload")
                  ? "Claude's servers are temporarily busy. Please wait a moment and try again."
                  : error.toLowerCase().includes("truncat")
                  ? "The script is long and the response was cut off. Try again — it usually works on retry."
                  : error.toLowerCase().includes("json")
                  ? "The AI response had a formatting issue. Try again — this is usually transient."
                  : "Check that your ANTHROPIC_API_KEY is set in .env.local and restart the dev server."}
              </p>
            </div>
          )}

          <label className="block text-sm font-medium text-gray-500 mb-1.5">
            Your script
          </label>
          <Textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Paste your video script here... or load the sample below."
          />

          <div className="flex items-center justify-between mt-3.5 flex-wrap gap-2.5">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {wordCount > 0 ? `${wordCount} words · ~${estDuration}s` : "No content yet"}
              </span>
              {!script ? (
                <Button variant="secondary" onClick={() => setScript(SAMPLE_SCRIPT)}>
                  Load sample
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setScript("")}>
                  Clear
                </Button>
              )}
            </div>
            <Button
              disabled={script.trim().length <= 10}
              onClick={runSegmentation}
            >
              Segment script
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // --- PROCESSING ---
  if (phase === "processing") {
    return (
      <div className="space-y-4">
        <Card>
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Spinner />
            <div className="text-center">
              <p className="font-semibold text-sm">{loadMsg}</p>
              <p className="text-xs text-gray-500 mt-1">
                Analyzing your {wordCount}-word script
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // --- RESULT ---
  if (phase === "result" && result) {
    const totalWords = result.segments.reduce((a, s) => a + s.word_count, 0);

    return (
      <div className="space-y-4">
        {/* Script analysis card */}
        {result.script_analysis && (
          <Card className="!bg-indigo-50 !border-indigo-200">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 text-sm font-bold">AI</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-indigo-900 m-0">Script analysis</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Badge variant="info">Topic: {result.script_analysis.topic}</Badge>
                  <Badge variant="keyword">Tone: {result.script_analysis.tone}</Badge>
                  <Badge variant="duration">Recency: {result.script_analysis.recency}</Badge>
                </div>
                {result.script_analysis.key_entities?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {result.script_analysis.key_entities.map((e, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white text-indigo-700 border border-indigo-200">{e}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: result.segment_count, label: "Segments" },
            { value: `${result.total_duration_sec?.toFixed(1)}s`, label: "Est. duration" },
            { value: totalWords, label: "Words" },
          ].map((item) => (
            <Card key={item.label} className="text-center !py-3.5">
              <p className="text-2xl font-bold text-indigo-500 m-0">{item.value}</p>
              <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">
                {item.label}
              </p>
            </Card>
          ))}
        </div>

        {/* Segment list */}
        <Card flush>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <span className="font-semibold text-sm">Segments</span>
            <Button variant="secondary" onClick={reset}>
              ← New script
            </Button>
          </div>
          {result.segments.map((seg, i) => (
            <div
              key={seg.id}
              className="flex gap-3.5 items-start px-5 py-3.5 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-xs font-bold text-indigo-500 shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed m-0 text-gray-900">{seg.text}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Badge variant="keyword">{seg.image_query || seg.keyword}</Badge>
                  <Badge variant="duration">{seg.estimated_duration_sec}s</Badge>
                  <Badge variant="words">{seg.word_count} words</Badge>
                </div>
              </div>
            </div>
          ))}
        </Card>

        <Button className="w-full !py-3.5 !text-sm" onClick={() => onComplete(result)}>
          Continue to segment editor →
        </Button>
      </div>
    );
  }

  return null;
}

