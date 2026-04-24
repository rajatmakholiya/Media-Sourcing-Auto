// src/components/pipeline/PipelineShell.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusDot, StepNumber } from "@/components/ui";
import { usePipelineEvents, fetchPipelineState } from "@/lib/use-pipeline-events";
import type { SegmentationResult } from "@/lib/pipeline-store";
import ScriptInput from "./ScriptInput";
import SegmentEditor from "./SegmentEditor";
import VoiceoverStep from "./VoiceoverStep";
import MediaSelection from "./MediaSelection";
import PreviewExport from "./PreviewExport";
import type { VoiceoverData } from "./VoiceoverStep";
import type { MediaSelectionData } from "./MediaSelection";

const STEPS = [
  { key: "script", label: "Script Input" },
  { key: "editor", label: "Segment Editor" },
  { key: "voiceover", label: "Voiceover" },
  { key: "media", label: "Media Selection" },
  { key: "export", label: "Preview & Export" },
];

export default function PipelineShell() {
  const [currentStep, setCurrentStep] = useState(0);
  const [segments, setSegments] = useState<SegmentationResult | null>(null);
  const [editedSegments, setEditedSegments] = useState<SegmentationResult | null>(null);
  const [voiceover, setVoiceover] = useState<VoiceoverData | null>(null);
  const [mediaSelections, setMediaSelections] = useState<MediaSelectionData | null>(null);
  const [allowNonLicensed, setAllowNonLicensed] = useState(false);

  // SSE — listen for real-time updates from the MCP server
  const { connected } = usePipelineEvents({
    onSegmentationComplete: useCallback((data:any) => {
      setSegments(data.segments);
    }, []),
  });

  // On mount, check if there's existing state (e.g. page refresh)
  useEffect(() => {
    fetchPipelineState()
      .then((state) => {
        if (state.segments) {
          setSegments(state.segments);
        }
      })
      .catch(() => {});
  }, []);

  const activeSegments = editedSegments || segments;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top navigation bar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
        <span className="font-bold text-base text-indigo-500 shrink-0">
          ScriptVideo
        </span>

        {/* Step indicators */}
        <div className="flex items-center gap-1 flex-1 max-w-2xl">
          {STEPS.map((step, i) => (
            <div key={step.key} className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  if (i <= currentStep) setCurrentStep(i);
                }}
                disabled={i > currentStep}
                className="flex items-center gap-1.5 disabled:cursor-default"
              >
                <StepNumber n={i + 1} active={i <= currentStep} />
                <span
                  className={`text-xs ${
                    i === currentStep
                      ? "font-semibold text-gray-900"
                      : i < currentStep
                      ? "font-medium text-gray-600"
                      : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span className="text-gray-300 mx-0.5 text-xs">›</span>
              )}
            </div>
          ))}
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
          <StatusDot online={connected} />
          {connected ? "Connected" : "Connecting..."}
        </div>
      </nav>

      {/* Step content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Step heading */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">
            {STEPS[currentStep].label}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {currentStep === 0 && "Paste your script and let AI segment it automatically"}
            {currentStep === 1 && "Merge, split, reword segments and edit keywords"}
            {currentStep === 2 && "Generate or upload voiceover audio for each segment"}
            {currentStep === 3 && "Select images and videos for each segment"}
            {currentStep === 4 && "Preview the final video and export in multiple formats"}
          </p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1 rounded-full transition-colors ${
                i <= currentStep ? "bg-indigo-500" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* Step 0: Script Input */}
        {currentStep === 0 && (
          <ScriptInput
            segments={segments}
            allowNonLicensed={allowNonLicensed}
            onAllowNonLicensedChange={setAllowNonLicensed}
            onComplete={(result) => {
              setSegments(result);
              setCurrentStep(1);
            }}
          />
        )}

        {/* Step 1: Segment Editor */}
        {currentStep === 1 && segments && (
          <SegmentEditor
            initialSegments={segments}
            onComplete={(edited) => {
              setEditedSegments(edited);
              setCurrentStep(2);
            }}
            onBack={() => setCurrentStep(0)}
          />
        )}
        {currentStep === 1 && !segments && (
          <EmptyState onBack={() => setCurrentStep(0)} />
        )}

        {/* Step 2: Voiceover */}
        {currentStep === 2 && activeSegments && (
          <VoiceoverStep
            segments={activeSegments}
            onComplete={(vo) => {
              setVoiceover(vo);
              setCurrentStep(3);
            }}
            onBack={() => setCurrentStep(1)}
          />
        )}
        {currentStep === 2 && !activeSegments && (
          <EmptyState onBack={() => setCurrentStep(0)} />
        )}

        {/* Step 3: Media Selection */}
        {currentStep === 3 && activeSegments && voiceover && (
          <MediaSelection
            segments={activeSegments}
            voiceover={voiceover}
            allowNonLicensed={allowNonLicensed}
            onComplete={(data) => {
              setMediaSelections(data);
              setCurrentStep(4);
            }}
            onBack={() => setCurrentStep(2)}
          />
        )}
        {currentStep === 3 && (!activeSegments || !voiceover) && (
          <EmptyState onBack={() => setCurrentStep(0)} />
        )}

        {/* Step 4: Preview & Export */}
        {currentStep === 4 && activeSegments && voiceover && mediaSelections && (
          <PreviewExport
            segments={activeSegments}
            voiceover={voiceover}
            mediaSelections={mediaSelections}
            onBack={() => setCurrentStep(3)}
          />
        )}
        {currentStep === 4 && (!activeSegments || !voiceover || !mediaSelections) && (
          <EmptyState onBack={() => setCurrentStep(0)} />
        )}
      </main>
    </div>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div className="text-center py-16 text-gray-400 text-sm">
      Complete previous steps first.
      <br />
      <button
        onClick={onBack}
        className="mt-4 px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-white"
      >
        ← Start over
      </button>
    </div>
  );
}