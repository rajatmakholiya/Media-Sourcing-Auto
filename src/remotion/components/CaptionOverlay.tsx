// src/remotion/components/CaptionOverlay.tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import type { CaptionStyle } from "@/lib/remotion-config";

type Props = {
  text: string;
  settings: CaptionStyle;
  durationInFrames: number;
};

const FONT_SIZES = {
  small: 32,
  medium: 44,
  large: 60,
};

export const CaptionOverlay: React.FC<Props> = ({ text, settings, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = text.split(" ");
  const fontSize = FONT_SIZES[settings.fontSize];

  // Background style — refined for broadcast quality
  const bgStyle = (): React.CSSProperties => {
    switch (settings.background) {
      case "solid":
        return {
          backgroundColor: "rgba(0,0,0,0.82)",
          padding: "14px 28px",
          borderRadius: 10,
        };
      case "semi-transparent":
        return {
          backgroundColor: "rgba(0,0,0,0.5)",
          padding: "14px 28px",
          borderRadius: 10,
          backdropFilter: "blur(4px)",
        };
      case "blur":
        return {
          backdropFilter: "blur(16px) saturate(1.2)",
          backgroundColor: "rgba(0,0,0,0.25)",
          padding: "14px 28px",
          borderRadius: 10,
        };
      case "none":
      default:
        return {
          padding: "14px 28px",
        };
    }
  };

  // Multi-layer text shadow for depth — works across all styles
  const textShadowBase =
    "0 2px 4px rgba(0,0,0,0.9), 0 4px 12px rgba(0,0,0,0.6), 0 0px 40px rgba(0,0,0,0.3)";

  // Smooth entrance with spring
  const entranceSpring = spring({
    frame,
    fps,
    config: { damping: 28, stiffness: 120, mass: 0.8 },
  });

  // Smooth exit — slightly longer for elegance
  const exit = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.ease) }
  );

  const opacity = Math.min(entranceSpring, exit);
  const translateY = interpolate(entranceSpring, [0, 1], [14, 0]);
  const scale = interpolate(entranceSpring, [0, 1], [0.97, 1]);

  // Render based on caption style
  const renderCaption = () => {
    switch (settings.style) {
      case "bold-highlight": {
        // Emphasize key words with bold + accent color
        return (
          <span>
            {words.map((word, i) => {
              const isBold = i % 3 === 0;
              return (
                <span key={i}>
                  {i > 0 && " "}
                  <span
                    style={{
                      fontWeight: isBold ? 800 : 500,
                      color: isBold ? "#FFD700" : settings.color,
                      textShadow: isBold
                        ? "0 1px 6px rgba(255,215,0,0.4), " + textShadowBase
                        : textShadowBase,
                    }}
                  >
                    {word}
                  </span>
                </span>
              );
            })}
          </span>
        );
      }

      case "word-by-word": {
        const wordsPerSecond = words.length / (durationInFrames / fps);
        const framesPerWord = Math.max(1, Math.floor(fps / wordsPerSecond / 1.2));

        return (
          <span>
            {words.map((word, i) => {
              const wordStart = i * framesPerWord;
              const wordSpring = spring({
                frame: Math.max(0, frame - wordStart),
                fps,
                config: { damping: 22, stiffness: 150, mass: 0.6 },
              });
              return (
                <span
                  key={i}
                  style={{
                    opacity: wordSpring,
                    display: "inline-block",
                    transform: `scale(${interpolate(wordSpring, [0, 1], [0.85, 1])}) translateY(${interpolate(wordSpring, [0, 1], [6, 0])}px)`,
                    marginRight: 8,
                    color: settings.color,
                    textShadow: textShadowBase,
                    fontWeight: 600,
                  }}
                >
                  {word}
                </span>
              );
            })}
          </span>
        );
      }

      case "karaoke": {
        const framesPerWord = Math.max(1, Math.floor(durationInFrames / words.length));

        return (
          <span>
            {words.map((word, i) => {
              const isActive = frame >= i * framesPerWord && frame < (i + 1) * framesPerWord;
              const isPast = frame >= (i + 1) * framesPerWord;

              // Smooth scale for active word
              const activeProgress = isActive
                ? interpolate(
                    frame - i * framesPerWord,
                    [0, Math.min(4, framesPerWord)],
                    [0, 1],
                    { extrapolateRight: "clamp" }
                  )
                : 0;
              const wordScale = isActive ? interpolate(activeProgress, [0, 1], [1, 1.08]) : 1;

              return (
                <span
                  key={i}
                  style={{
                    color: isActive || isPast ? "#FFD700" : settings.color + "77",
                    fontWeight: isActive ? 800 : isPast ? 600 : 500,
                    transform: `scale(${wordScale})`,
                    display: "inline-block",
                    marginRight: 7,
                    textShadow: isActive
                      ? "0 0 12px rgba(255,215,0,0.5), " + textShadowBase
                      : textShadowBase,
                    opacity: isActive || isPast ? 1 : 0.55,
                  }}
                >
                  {word}
                </span>
              );
            })}
          </span>
        );
      }

      case "default":
      default:
        return (
          <span
            style={{
              color: settings.color,
              textShadow: textShadowBase,
              fontWeight: 600,
            }}
          >
            {text}
          </span>
        );
    }
  };

  // Position mapping — refined spacing
  const getPositionStyle = (): React.CSSProperties => {
    switch (settings.position) {
      case "top":
        return { top: 80, bottom: "auto" };
      case "center":
        return { top: "50%", transform: "translateY(-50%)" };
      case "bottom":
      default:
        return { bottom: 80, top: "auto" };
    }
  };

  return (
    <AbsoluteFill
      style={{
        justifyContent: settings.position === "center" ? "center" : "flex-end",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 32,
          right: 32,
          textAlign: "center",
          ...getPositionStyle(),
          opacity,
          transform: `translateY(${translateY}px) scale(${scale})`,
          fontFamily: "'Inter', 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif",
          fontSize,
          lineHeight: 1.35,
          fontWeight: 600,
          letterSpacing: -0.3,
          ...bgStyle(),
        }}
      >
        {renderCaption()}
      </div>
    </AbsoluteFill>
  );
};
