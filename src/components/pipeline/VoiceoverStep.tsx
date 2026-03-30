// src/components/pipeline/VoiceoverStep.tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { Card, Button, Badge, Spinner } from "@/components/ui";
import type { SegmentationResult } from "@/lib/pipeline-store";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  AlertCircle,
  Upload,
  Music,
  Mic,
  VolumeX,
  X,
  FileAudio,
} from "lucide-react";

// --- Types ---

type VoiceResult = {
  segment_id: number;
  text: string;
  audio_base64: string | null;
  duration_sec: number;
  provider: string;
  error?: string;
};

export type VoiceoverData = {
  mode: "generate" | "upload" | "music_only" | "no_audio";
  results: VoiceResult[];
  total_duration_sec: number;
  provider_used: string;
  is_demo: boolean;
  uploaded_file?: { name: string; url: string; duration_sec: number };
  background_music?: { name: string; url: string };
};

type Provider = "elevenlabs" | "openai" | "google";
type AudioMode = "generate" | "upload" | "music_only" | "no_audio";

const PROVIDERS: {
  id: Provider;
  label: string;
  voices: { id: string; label: string }[];
}[] = [
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    voices: [
      { id: "rachel", label: "Rachel (Female)" },
      { id: "drew", label: "Drew (Male)" },
      { id: "clyde", label: "Clyde (Deep Male)" },
      { id: "paul", label: "Paul (Narration)" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI TTS",
    voices: [
      { id: "alloy", label: "Alloy (Neutral)" },
      { id: "nova", label: "Nova (Female)" },
      { id: "onyx", label: "Onyx (Male)" },
      { id: "echo", label: "Echo (Deep)" },
      { id: "shimmer", label: "Shimmer (Warm)" },
    ],
  },
  {
    id: "google",
    label: "Google Cloud TTS",
    voices: [
      { id: "en-US-Neural2-A", label: "Neural A (Male)" },
      { id: "en-US-Neural2-C", label: "Neural C (Female)" },
      { id: "en-US-Neural2-F", label: "Neural F (Female)" },
    ],
  },
];

const MODE_OPTIONS: {
  id: AudioMode;
  label: string;
  description: string;
  icon: typeof Mic;
}[] = [
  {
    id: "generate",
    label: "Generate voiceover",
    description: "AI-generated narration for each segment",
    icon: Mic,
  },
  {
    id: "upload",
    label: "Upload voiceover",
    description: "Use your own pre-recorded audio file",
    icon: Upload,
  },
  {
    id: "music_only",
    label: "Background music only",
    description: "No narration — just background music",
    icon: Music,
  },
  {
    id: "no_audio",
    label: "No audio",
    description: "Silent video with captions only",
    icon: VolumeX,
  },
];

export default function VoiceoverStep({
  segments,
  onComplete,
  onBack,
}: {
  segments: SegmentationResult;
  onComplete: (voiceover: VoiceoverData) => void;
  onBack: () => void;
}) {
  // Mode selection
  const [mode, setMode] = useState<AudioMode>("generate");

  // TTS config
  const [provider, setProvider] = useState<Provider>("openai");
  const [voice, setVoice] = useState("alloy");
  const [speed, setSpeed] = useState(1.0);

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    url: string;
    duration_sec: number;
    file: File;
  } | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Background music
  const [bgMusic, setBgMusic] = useState<{
    name: string;
    url: string;
    file: File;
  } | null>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  // Generation state
  const [phase, setPhase] = useState<"config" | "generating" | "preview">("config");
  const [progress, setProgress] = useState(0);
  const [voiceover, setVoiceover] = useState<VoiceoverData | null>(null);
  const [error, setError] = useState("");

  // Playback
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [isPlayingUpload, setIsPlayingUpload] = useState(false);
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentProvider = PROVIDERS.find((p) => p.id === provider)!;

  const handleProviderChange = (pid: Provider) => {
    setProvider(pid);
    const prov = PROVIDERS.find((p) => p.id === pid);
    if (prov) setVoice(prov.voices[0].id);
  };

  // --- File upload handling ---
  const handleVoiceoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      setUploadedFile({
        name: file.name,
        url,
        duration_sec: Math.round(audio.duration * 10) / 10,
        file,
      });
    };
    // Fallback if metadata doesn't load
    audio.onerror = () => {
      setUploadedFile({
        name: file.name,
        url,
        duration_sec: segments.total_duration_sec,
        file,
      });
    };
    e.target.value = "";
  };

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgMusic({ name: file.name, url: URL.createObjectURL(file), file });
    e.target.value = "";
  };

  const playUploadedFile = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (isPlayingUpload) {
      setIsPlayingUpload(false);
      return;
    }
    if (!uploadedFile) return;
    const audio = new Audio(uploadedFile.url);
    audio.onended = () => setIsPlayingUpload(false);
    audio.play();
    audioRef.current = audio;
    setIsPlayingUpload(true);
  };

  const playMusicFile = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (isPlayingMusic) {
      setIsPlayingMusic(false);
      return;
    }
    if (!bgMusic) return;
    const audio = new Audio(bgMusic.url);
    audio.onended = () => setIsPlayingMusic(false);
    audio.play();
    audioRef.current = audio;
    setIsPlayingMusic(true);
  };

  // --- Generate TTS ---
  const generate = useCallback(async () => {
    setPhase("generating");
    setError("");
    setProgress(0);

    const total = segments.segments.length;
    const interval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 1, total));
    }, 800);

    try {
      const resp = await fetch("/api/voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: segments.segments.map((s) => ({ id: s.id, text: s.text })),
          provider,
          voice,
          speed,
        }),
      });

      clearInterval(interval);
      setProgress(total);

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${resp.status}`);
      }

      const data = await resp.json();
      setVoiceover({
        mode: "generate",
        ...data,
        background_music: bgMusic
          ? { name: bgMusic.name, url: bgMusic.url }
          : undefined,
      });
      setPhase("preview");
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "Generation failed");
      setPhase("config");
    }
  }, [segments, provider, voice, speed, bgMusic]);

  // --- Proceed for non-generate modes ---
  const handleProceed = () => {
    const estDuration = segments.total_duration_sec;

    if (mode === "upload") {
      if (!uploadedFile) return;
      onComplete({
        mode: "upload",
        results: segments.segments.map((s) => ({
          segment_id: s.id,
          text: s.text,
          audio_base64: null,
          duration_sec: s.estimated_duration_sec,
          provider: "uploaded",
        })),
        total_duration_sec: uploadedFile.duration_sec,
        provider_used: "uploaded",
        is_demo: false,
        uploaded_file: {
          name: uploadedFile.name,
          url: uploadedFile.url,
          duration_sec: uploadedFile.duration_sec,
        },
        background_music: bgMusic
          ? { name: bgMusic.name, url: bgMusic.url }
          : undefined,
      });
      return;
    }

    if (mode === "music_only") {
      onComplete({
        mode: "music_only",
        results: segments.segments.map((s) => ({
          segment_id: s.id,
          text: s.text,
          audio_base64: null,
          duration_sec: s.estimated_duration_sec,
          provider: "none",
        })),
        total_duration_sec: estDuration,
        provider_used: "none",
        is_demo: false,
        background_music: bgMusic
          ? { name: bgMusic.name, url: bgMusic.url }
          : undefined,
      });
      return;
    }

    if (mode === "no_audio") {
      onComplete({
        mode: "no_audio",
        results: segments.segments.map((s) => ({
          segment_id: s.id,
          text: s.text,
          audio_base64: null,
          duration_sec: s.estimated_duration_sec,
          provider: "none",
        })),
        total_duration_sec: estDuration,
        provider_used: "none",
        is_demo: false,
      });
      return;
    }
  };

  // --- Playback for generated segments ---
  const playSegment = (result: VoiceResult) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playingId === result.segment_id) {
      setPlayingId(null);
      return;
    }
    if (!result.audio_base64) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(result.text);
      utter.rate = speed;
      utter.onend = () => setPlayingId(null);
      window.speechSynthesis.speak(utter);
      setPlayingId(result.segment_id);
      return;
    }
    const audio = new Audio(`data:audio/mpeg;base64,${result.audio_base64}`);
    audio.onended = () => setPlayingId(null);
    audio.play();
    audioRef.current = audio;
    setPlayingId(result.segment_id);
  };

  const playAll = () => {
    if (!voiceover) return;
    let idx = 0;
    const playNext = () => {
      if (idx >= voiceover.results.length) {
        setPlayingId(null);
        return;
      }
      const r = voiceover.results[idx];
      setPlayingId(r.segment_id);
      if (!r.audio_base64) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(r.text);
        u.rate = speed;
        u.onend = () => { idx++; playNext(); };
        window.speechSynthesis.speak(u);
      } else {
        const a = new Audio(`data:audio/mpeg;base64,${r.audio_base64}`);
        a.onended = () => { idx++; playNext(); };
        a.play();
        audioRef.current = a;
      }
    };
    playNext();
  };

  const stopAll = () => {
    window.speechSynthesis.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlayingId(null);
    setIsPlayingUpload(false);
    setIsPlayingMusic(false);
  };

  // Hidden file inputs
  const fileInputs = (
    <>
      <input
        ref={uploadInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleVoiceoverUpload}
      />
      <input
        ref={musicInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleMusicUpload}
      />
    </>
  );

  // =====================
  // GENERATING PHASE
  // =====================
  if (phase === "generating") {
    const pct = segments.segments.length > 0
      ? Math.round((progress / segments.segments.length) * 100)
      : 0;
    return (
      <Card>
        {fileInputs}
        <div className="flex flex-col items-center py-12 gap-5">
          <Spinner />
          <div className="text-center">
            <p className="font-semibold text-sm">Generating voiceover...</p>
            <p className="text-xs text-gray-500 mt-1">
              Segment {Math.min(progress + 1, segments.segments.length)} of{" "}
              {segments.segments.length}
            </p>
          </div>
          <div className="w-64">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 text-center mt-1.5">{pct}%</p>
          </div>
        </div>
      </Card>
    );
  }

  // =====================
  // PREVIEW PHASE (after generation)
  // =====================
  if (phase === "preview" && voiceover) {
    return (
      <div className="space-y-4">
        {fileInputs}

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center !py-3.5">
            <p className="text-2xl font-bold text-indigo-500 m-0">{voiceover.results.length}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">Clips</p>
          </Card>
          <Card className="text-center !py-3.5">
            <p className="text-2xl font-bold text-indigo-500 m-0">{voiceover.total_duration_sec}s</p>
            <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">Duration</p>
          </Card>
          <Card className="text-center !py-3.5">
            <p className="text-2xl font-bold text-indigo-500 m-0 capitalize">{voiceover.provider_used}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">Provider</p>
          </Card>
        </div>

        {voiceover.is_demo && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>
              <strong>Demo mode</strong> — no TTS API key configured. Using browser speech
              synthesis for preview. Add ELEVENLABS_API_KEY or OPENAI_API_KEY to .env.local for
              real audio.
            </div>
          </div>
        )}

        {/* Playback list */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Voiceover preview</h3>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={playingId !== null ? stopAll : playAll}>
                {playingId !== null ? <><Pause size={13} /> Stop</> : <><Play size={13} /> Play all</>}
              </Button>
              <Button variant="ghost" onClick={() => { stopAll(); setPhase("config"); setVoiceover(null); }}>
                <RotateCcw size={13} /> Regenerate
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            {voiceover.results.map((result, i) => (
              <div
                key={result.segment_id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  playingId === result.segment_id
                    ? "bg-indigo-50 border border-indigo-200"
                    : "hover:bg-gray-50 border border-transparent"
                }`}
              >
                <button
                  onClick={() => playSegment(result)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    playingId === result.segment_id
                      ? "bg-indigo-500 text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {playingId === result.segment_id ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm m-0 truncate text-gray-900 font-medium">{result.text}</p>
                </div>
                <Badge variant="duration">{result.duration_sec}s</Badge>
                {result.provider === "demo" && <Badge variant="fallback">demo</Badge>}
              </div>
            ))}
          </div>
        </Card>

        {/* Background music (optional add during preview) */}
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music size={15} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Background music</span>
              <span className="text-xs text-gray-400">(optional)</span>
            </div>
            {bgMusic ? (
              <div className="flex items-center gap-2">
                <button onClick={playMusicFile} className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500">
                  {isPlayingMusic ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <span className="text-xs text-gray-600 max-w-[160px] truncate">{bgMusic.name}</span>
                <button onClick={() => { stopAll(); setBgMusic(null); }} className="text-gray-400 hover:text-red-500">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => musicInputRef.current?.click()}>
                <Music size={13} /> Add music
              </Button>
            )}
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="secondary" onClick={onBack}>← Back to editor</Button>
          <Button onClick={() => onComplete({
            ...voiceover,
            background_music: bgMusic ? { name: bgMusic.name, url: bgMusic.url } : undefined,
          })}>
            Continue to media selection →
          </Button>
        </div>
      </div>
    );
  }

  // =====================
  // CONFIG PHASE
  // =====================
  return (
    <div className="space-y-4">
      {fileInputs}

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          <strong>Error: </strong>{error}
        </div>
      )}

      {/* Mode selection */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Audio mode</h3>
        <div className="grid grid-cols-2 gap-2">
          {MODE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={() => setMode(opt.id)}
                className={`p-3.5 rounded-lg border text-left transition-colors ${
                  mode === opt.id
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon
                    size={15}
                    className={mode === opt.id ? "text-indigo-600" : "text-gray-400"}
                  />
                  <span
                    className={`text-sm font-medium ${
                      mode === opt.id ? "text-indigo-700" : "text-gray-700"
                    }`}
                  >
                    {opt.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 ml-[23px]">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Mode-specific config */}

      {/* --- GENERATE MODE --- */}
      {mode === "generate" && (
        <>
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">TTS provider</h3>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  className={`p-3 rounded-lg border text-sm font-medium text-center transition-colors ${
                    provider === p.id
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">Voice</label>
                <select
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-gray-200 text-sm bg-white"
                >
                  {currentProvider.voices.map((v) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  Speed: {speed.toFixed(1)}x
                </label>
                <input
                  type="range" min="0.5" max="2.0" step="0.1" value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full mt-2"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0.5x</span><span>1.0x</span><span>2.0x</span>
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* --- UPLOAD MODE --- */}
      {mode === "upload" && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Upload voiceover</h3>
          {uploadedFile ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <button
                onClick={playUploadedFile}
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  isPlayingUpload
                    ? "bg-indigo-500 text-white"
                    : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-100"
                }`}
              >
                {isPlayingUpload ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 m-0 truncate">
                  {uploadedFile.name}
                </p>
                <p className="text-xs text-gray-500 m-0 mt-0.5">
                  {uploadedFile.duration_sec}s duration
                </p>
              </div>
              <button
                onClick={() => { stopAll(); setUploadedFile(null); }}
                className="text-gray-400 hover:text-red-500 p-1"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => uploadInputRef.current?.click()}
              className="w-full p-8 rounded-lg border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors flex flex-col items-center gap-2"
            >
              <FileAudio size={24} className="text-gray-400" />
              <span className="text-sm text-gray-600 font-medium">
                Click to upload audio file
              </span>
              <span className="text-xs text-gray-400">
                MP3, WAV, M4A, OGG — any audio format
              </span>
            </button>
          )}
          {uploadedFile &&
            Math.abs(uploadedFile.duration_sec - segments.total_duration_sec) > 3 && (
              <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>
                  Audio duration ({uploadedFile.duration_sec}s) differs from segment
                  total ({segments.total_duration_sec}s) by more than 3 seconds. The
                  video will be trimmed or padded to match.
                </span>
              </div>
            )}
        </Card>
      )}

      {/* --- MUSIC ONLY MODE --- */}
      {mode === "music_only" && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Background music</h3>
          <p className="text-xs text-gray-500 mb-3">
            Segments will use estimated timing for visuals. Captions will still be generated.
          </p>
          {bgMusic ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <button
                onClick={playMusicFile}
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  isPlayingMusic
                    ? "bg-indigo-500 text-white"
                    : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-100"
                }`}
              >
                {isPlayingMusic ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 m-0 truncate">{bgMusic.name}</p>
              </div>
              <button
                onClick={() => { stopAll(); setBgMusic(null); }}
                className="text-gray-400 hover:text-red-500 p-1"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => musicInputRef.current?.click()}
              className="w-full p-8 rounded-lg border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors flex flex-col items-center gap-2"
            >
              <Music size={24} className="text-gray-400" />
              <span className="text-sm text-gray-600 font-medium">Click to upload music</span>
              <span className="text-xs text-gray-400">MP3, WAV, M4A, OGG</span>
            </button>
          )}
        </Card>
      )}

      {/* --- NO AUDIO MODE --- */}
      {mode === "no_audio" && (
        <Card>
          <div className="flex items-center gap-3 py-4">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <VolumeX size={18} className="text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 m-0">Silent video</p>
              <p className="text-xs text-gray-500 m-0 mt-0.5">
                Segment timing will use estimated durations. Captions will still be burned in.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Background music option (for generate and upload modes) */}
      {(mode === "generate" || mode === "upload") && (
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music size={15} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Background music</span>
              <span className="text-xs text-gray-400">(optional)</span>
            </div>
            {bgMusic ? (
              <div className="flex items-center gap-2">
                <button onClick={playMusicFile} className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500">
                  {isPlayingMusic ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <span className="text-xs text-gray-600 max-w-[160px] truncate">{bgMusic.name}</span>
                <button onClick={() => { stopAll(); setBgMusic(null); }} className="text-gray-400 hover:text-red-500">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => musicInputRef.current?.click()}>
                <Music size={13} /> Add music
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onBack}>← Back to editor</Button>
        {mode === "generate" ? (
          <Button onClick={generate}>
            <Volume2 size={15} /> Generate voiceover
          </Button>
        ) : (
          <Button
            onClick={handleProceed}
            disabled={mode === "upload" && !uploadedFile}
          >
            Continue to media selection →
          </Button>
        )}
      </div>
    </div>
  );
}