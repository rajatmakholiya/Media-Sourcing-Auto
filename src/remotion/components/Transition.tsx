// src/remotion/components/Transition.tsx
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";
import type { TransitionType } from "@/lib/remotion-config";

type Props = {
  type: TransitionType;
  durationInFrames: number;
  children: React.ReactNode;
};

export const Transition: React.FC<Props> = ({ type, durationInFrames, children }) => {
  const frame = useCurrentFrame();

  // Eased progress — smooth cubic feel instead of jarring linear
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const getStyle = (): React.CSSProperties => {
    switch (type) {
      case "crossfade":
        return {
          opacity: interpolate(progress, [0, 1], [0, 1], {
            easing: Easing.inOut(Easing.ease),
          }),
        };

      case "slide-left":
        return {
          transform: `translateX(${(1 - progress) * 100}%)`,
        };

      case "slide-up":
        return {
          transform: `translateY(${(1 - progress) * 100}%)`,
        };

      case "wipe": {
        // Smooth wipe from left to right
        const clipX = progress * 100;
        return {
          clipPath: `inset(0 ${100 - clipX}% 0 0)`,
        };
      }

      case "zoom": {
        const scale = interpolate(progress, [0, 1], [1.3, 1]);
        const opacity = interpolate(progress, [0, 0.4], [0, 1], {
          extrapolateRight: "clamp",
        });
        return {
          transform: `scale(${scale})`,
          opacity,
        };
      }

      case "fade-zoom": {
        // Subtle zoom-in with fade — cinematic feel
        const scale = interpolate(progress, [0, 1], [1.08, 1]);
        const opacity = interpolate(progress, [0, 0.6], [0, 1], {
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.ease),
        });
        return {
          transform: `scale(${scale})`,
          opacity,
        };
      }

      case "blur-fade": {
        // Fade in while deblurring — premium broadcast feel
        const opacity = interpolate(progress, [0, 0.7], [0, 1], {
          extrapolateRight: "clamp",
        });
        const blur = interpolate(progress, [0, 0.8], [8, 0], {
          extrapolateRight: "clamp",
        });
        return {
          opacity,
          filter: `blur(${blur}px)`,
        };
      }

      case "slide-right":
        return {
          transform: `translateX(${-(1 - progress) * 100}%)`,
        };

      case "none":
      default:
        return {};
    }
  };

  return (
    <AbsoluteFill style={getStyle()}>
      {children}
    </AbsoluteFill>
  );
};
