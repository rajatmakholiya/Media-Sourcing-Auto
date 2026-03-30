// src/app/api/voiceover/route.ts
// Generates TTS audio for each segment
// Supports multiple providers — currently stubbed with Web Speech API fallback
// Replace with real ElevenLabs / OpenAI / Google TTS calls when ready
import { NextRequest, NextResponse } from "next/server";

type VoiceoverRequest = {
  segments: { id: number; text: string }[];
  provider: "elevenlabs" | "openai" | "google";
  voice: string;
  speed: number;
};

// --- ElevenLabs ---
async function generateElevenLabs(
  text: string,
  voice: string,
  speed: number
): Promise<{ audio_base64: string; duration_sec: number }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

  const voiceIds: Record<string, string> = {
    rachel: "21m00Tcm4TlvDq8ikWAM",
    drew: "29vD33N1CtxCmqQRPOHJ",
    clyde: "2EiwWnXFnvU5JabPnv8n",
    paul: "5Q0t7uMcjvnagumLfvZi",
    alloy: "21m00Tcm4TlvDq8ikWAM",
  };
  const vid = voiceIds[voice] || voiceIds.rachel;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${vid}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          speed,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error: ${err}`);
  }

  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  // Estimate duration from audio size (mp3 ~16kbps for speech)
  const estimatedDuration = buffer.byteLength / 2000;

  return { audio_base64: base64, duration_sec: Math.round(estimatedDuration * 10) / 10 };
}

// --- OpenAI TTS ---
async function generateOpenAI(
  text: string,
  voice: string,
  speed: number
): Promise<{ audio_base64: string; duration_sec: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "tts-1",
      input: text,
      voice: voice || "alloy",
      speed: speed || 1.0,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI TTS error: ${err}`);
  }

  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const estimatedDuration = buffer.byteLength / 2000;

  return { audio_base64: base64, duration_sec: Math.round(estimatedDuration * 10) / 10 };
}

// --- Stub / Demo mode ---
// Returns a silent placeholder so the UI flow works without any TTS key
function generateStub(
  text: string,
  speed: number
): { audio_base64: null; duration_sec: number } {
  const words = text.trim().split(/\s+/).length;
  const duration = Math.round((words / (2.5 * speed)) * 10) / 10;
  return { audio_base64: null, duration_sec: duration };
}

export async function POST(req: NextRequest) {
  try {
    const body: VoiceoverRequest = await req.json();
    const { segments, provider, voice, speed } = body;

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return NextResponse.json({ error: "Segments required" }, { status: 400 });
    }

    const results = [];

    for (const seg of segments) {
      try {
        let result;

        if (provider === "elevenlabs" && process.env.ELEVENLABS_API_KEY) {
          result = await generateElevenLabs(seg.text, voice, speed);
        } else if (provider === "openai" && process.env.OPENAI_API_KEY) {
          result = await generateOpenAI(seg.text, voice, speed);
        } else {
          // Demo mode — no TTS key configured
          result = generateStub(seg.text, speed);
        }

        results.push({
          segment_id: seg.id,
          text: seg.text,
          ...result,
          provider: result.audio_base64 ? provider : "demo",
        });
      } catch (err) {
        // If one segment fails, fall back to stub for that segment
        results.push({
          segment_id: seg.id,
          text: seg.text,
          audio_base64: null,
          duration_sec: Math.round((seg.text.split(/\s+/).length / (2.5 * speed)) * 10) / 10,
          provider: "demo",
          error: err instanceof Error ? err.message : "Generation failed",
        });
      }
    }

    const totalDuration = results.reduce((a, r) => a + r.duration_sec, 0);
    const hasRealAudio = results.some((r) => r.audio_base64 !== null);

    return NextResponse.json({
      results,
      total_duration_sec: Math.round(totalDuration * 10) / 10,
      provider_used: hasRealAudio ? provider : "demo",
      is_demo: !hasRealAudio,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Voiceover generation failed" },
      { status: 500 }
    );
  }
}