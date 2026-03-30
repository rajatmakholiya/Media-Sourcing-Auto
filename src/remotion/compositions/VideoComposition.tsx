// src/remotion/compositions/VideoComposition.tsx
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, Audio, interpolate, Easing } from "remotion";
import type { VideoComposition as VideoCompType } from "@/lib/remotion-config";
import { CaptionOverlay } from "../components/CaptionOverlay";
import { Transition } from "../components/Transition";
import { SegmentClip } from "../components/SegmentClip";

type Props = {
  composition: VideoCompType;
};

export const VideoComposition: React.FC<Props> = ({ composition }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { segments, settings, background_music, voiceover_file } = composition;
  const transitionFrames = settings.transition_duration_frames;

  // Global fade-in (first 0.5s) and fade-out (last 0.5s) for polished start/end
  const fadeInFrames = Math.round(fps * 0.5);
  const fadeOutFrames = Math.round(fps * 0.5);
  const globalOpacity = interpolate(
    frame,
    [0, fadeInFrames, durationInFrames - fadeOutFrames, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Calculate start frame for each segment, accounting for transition overlaps
  let currentFrame = 0;
  const segmentTimeline = segments.map((seg, i) => {
    const startFrame = currentFrame;
    const hasTransition = seg.transition_in && seg.transition_in !== "none" && i > 0;
    currentFrame += seg.duration_frames;
    // Overlapping transitions: next segment starts earlier
    if (hasTransition && i > 0) {
      currentFrame -= transitionFrames;
    }
    return {
      ...seg,
      startFrame,
      endFrame: startFrame + seg.duration_frames,
      hasTransition,
    };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Main content with global fade */}
      <AbsoluteFill style={{ opacity: globalOpacity }}>
        {/* Render each segment as a Sequence */}
        {segmentTimeline.map((seg, i) => (
          <Sequence
            key={seg.id}
            from={seg.startFrame}
            durationInFrames={seg.duration_frames}
            name={`Segment ${seg.id}: ${seg.text.slice(0, 30)}`}
          >
            {/* Transition wrapper */}
            {seg.hasTransition ? (
              <Transition
                type={seg.transition_in}
                durationInFrames={transitionFrames}
              >
                <SegmentClip
                  segment={seg}
                  kenBurnsEnabled={settings.ken_burns.enabled}
                  kenBurnsIntensity={settings.ken_burns.intensity}
                />
              </Transition>
            ) : (
              <SegmentClip
                segment={seg}
                kenBurnsEnabled={settings.ken_burns.enabled}
                kenBurnsIntensity={settings.ken_burns.intensity}
              />
            )}

            {/* Caption overlay */}
            {settings.captions.enabled && (
              <CaptionOverlay
                text={seg.text}
                settings={settings.captions}
                durationInFrames={seg.duration_frames}
              />
            )}
          </Sequence>
        ))}

        {/* Voiceover audio — single uploaded file */}
        {voiceover_file?.url && (
          <Audio src={voiceover_file.url} volume={settings.voiceover_volume / 100} />
        )}

        {/* Per-segment AI voiceover audio */}
        {!voiceover_file &&
          segmentTimeline.map((seg) => {
            if (!seg.voiceover?.audio_base64) return null;
            return (
              <Sequence key={`vo-${seg.id}`} from={seg.startFrame} durationInFrames={seg.duration_frames}>
                <Audio
                  src={`data:audio/mpeg;base64,${seg.voiceover.audio_base64}`}
                  volume={settings.voiceover_volume / 100}
                />
              </Sequence>
            );
          })}

        {/* Background music — loops for the full duration */}
        {background_music?.url && (
          <Audio
            src={background_music.url}
            volume={settings.background_music_volume / 100}
            loop
          />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
