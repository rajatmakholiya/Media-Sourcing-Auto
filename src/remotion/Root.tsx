// src/remotion/Root.tsx
import { Composition } from "remotion";
import type { VideoComposition as VideoCompType } from "@/lib/remotion-config";
import { RESOLUTION_MAP } from "@/lib/remotion-config";
import { VideoComposition } from "./compositions/VideoComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ScriptVideo"
        component={VideoComposition}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          composition: null as unknown as VideoCompType,
        }}
        calculateMetadata={async ({ props }) => {
          const comp = props.composition;
          if (!comp) return {};

          const fps = comp.settings.fps;
          const res = RESOLUTION_MAP[comp.settings.resolution]?.[comp.settings.aspect_ratio];

          return {
            durationInFrames: comp.total_frames,
            fps,
            width: res?.width ?? 1080,
            height: res?.height ?? 1920,
          };
        }}
      />
    </>
  );
};
