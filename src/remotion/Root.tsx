// src/remotion/Root.tsx
import { Composition } from "remotion";
import type { VideoComposition as VideoCompType } from "@/lib/remotion-config";
import { VideoComposition } from "./compositions/VideoComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ScriptVideo"
        component={VideoComposition}
        durationInFrames={300} // overridden at render time
        fps={30} // overridden at render time
        width={1080} // overridden at render time
        height={1920} // overridden at render time
        defaultProps={{
          composition: null as unknown as VideoCompType,
        }}
      />
    </>
  );
};