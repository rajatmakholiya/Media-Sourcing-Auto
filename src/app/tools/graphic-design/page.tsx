import type { Metadata } from "next";
import ImageGeneratorV2 from '@/components/ImageGeneratorV2';

export const metadata: Metadata = {
  title: 'Graphic Design Studio | Studio Pro',
  description: 'AI-powered graphics generation with Leonardo AI and Google Gemini',
};

export default function GraphicDesignPage() {
  return <ImageGeneratorV2 />;
}
