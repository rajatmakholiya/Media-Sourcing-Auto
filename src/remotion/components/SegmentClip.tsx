// src/remotion/components/SegmentClip.tsx
import { AbsoluteFill, Img, OffthreadVideo, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { SegmentComposition } from "@/lib/remotion-config";

type Props = {
  segment: SegmentComposition;
  kenBurnsEnabled: boolean;
  kenBurnsIntensity: "subtle" | "medium" | "dramatic";
};

const INTENSITY_SCALE = {
  subtle: { zoom: 0.03, pan: 8 },
  medium: { zoom: 0.06, pan: 16 },
  dramatic: { zoom: 0.10, pan: 28 },
};

export const SegmentClip: React.FC<Props> = ({
  segment,
  kenBurnsEnabled,
  kenBurnsIntensity,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isVideo = segment.media.type === "video";
  const intensity = INTENSITY_SCALE[kenBurnsIntensity];

  // Smooth eased progress for Ken Burns — ease-in-out feels cinematic
  const progress = interpolate(frame, [0, segment.duration_frames], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });

  // Ken Burns transform
  let transform = "scale(1.01)"; // tiny default scale to avoid edge artifacts
  if (kenBurnsEnabled) {
    switch (segment.ken_burns_direction) {
      case "zoom-in": {
        const scale = 1.0 + progress * intensity.zoom;
        transform = `scale(${scale})`;
        break;
      }
      case "zoom-out": {
        const scale = 1.0 + intensity.zoom - progress * intensity.zoom;
        transform = `scale(${scale})`;
        break;
      }
      case "pan-left": {
        const tx = interpolate(progress, [0, 1], [intensity.pan * 0.3, -intensity.pan * 0.3]);
        transform = `scale(1.03) translateX(${tx}px)`;
        break;
      }
      case "pan-right": {
        const tx = interpolate(progress, [0, 1], [-intensity.pan * 0.3, intensity.pan * 0.3]);
        transform = `scale(1.03) translateX(${tx}px)`;
        break;
      }
      case "pan-up": {
        const ty = interpolate(progress, [0, 1], [intensity.pan * 0.25, -intensity.pan * 0.25]);
        transform = `scale(1.03) translateY(${ty}px)`;
        break;
      }
      case "pan-down": {
        const ty = interpolate(progress, [0, 1], [-intensity.pan * 0.25, intensity.pan * 0.25]);
        transform = `scale(1.03) translateY(${ty}px)`;
        break;
      }
    }
  }

  const mediaStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform,
  };

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
      {/* Media layer — skip if URL is missing (failed download) */}
      {segment.media.url ? (
        isVideo ? (
          <OffthreadVideo
            src={segment.media.url}
            style={mediaStyle}
            muted
          />
        ) : (
          <Img
            src={segment.media.url}
            style={mediaStyle}
          />
        )
      ) : null}

      {/* Cinematic vignette overlay — darkens edges for depth */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.35) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Subtle top/bottom gradient for caption readability */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 20%, transparent 75%, rgba(0,0,0,0.4) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
