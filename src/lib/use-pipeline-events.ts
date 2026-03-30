// src/lib/use-pipeline-events.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { getSessionId } from "./session";
import type { SegmentationResult, PipelineStep } from "./pipeline-store";

type PipelineEvents = {
  onScriptSubmitted?: (data: { script: string; wordCount: number; pipelineStep: PipelineStep }) => void;
  onSegmentationComplete?: (data: { segments: SegmentationResult; pipelineStep: PipelineStep }) => void;
  onSegmentsEdited?: (data: { segments: SegmentationResult; pipelineStep: PipelineStep }) => void;
  onPipelineStepChanged?: (data: { pipelineStep: PipelineStep }) => void;
};

export function usePipelineEvents(handlers: PipelineEvents) {
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const sessionId = getSessionId();
    const es = new EventSource(`/api/events?session=${sessionId}`);
    esRef.current = es;

    es.addEventListener("connected", () => setConnected(true));

    es.addEventListener("script_submitted", (e) => {
      const data = JSON.parse(e.data);
      handlersRef.current.onScriptSubmitted?.(data);
    });

    es.addEventListener("segmentation_complete", (e) => {
      const data = JSON.parse(e.data);
      handlersRef.current.onSegmentationComplete?.(data);
    });

    es.addEventListener("segments_edited", (e) => {
      const data = JSON.parse(e.data);
      handlersRef.current.onSegmentsEdited?.(data);
    });

    es.addEventListener("pipeline_step_changed", (e) => {
      const data = JSON.parse(e.data);
      handlersRef.current.onPipelineStepChanged?.(data);
    });

    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  return { connected };
}

// Fetch current state (on mount or after reconnect)
export async function fetchPipelineState() {
  const sessionId = getSessionId();
  const res = await fetch(`/api/state?session=${sessionId}`);
  if (!res.ok) throw new Error("Failed to fetch pipeline state");
  return res.json();
}

// Submit script to pipeline
export async function submitScriptToServer(script: string) {
  const sessionId = getSessionId();
  const res = await fetch("/api/submit-script", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": sessionId,
    },
    body: JSON.stringify({ script }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  return res.json();
}
