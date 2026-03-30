// src/app/api/media-search/route.ts
// Media search for Video Generator — images + videos
import { NextRequest, NextResponse } from "next/server";
import { searchMedia } from "@/lib/media-search";

export async function POST(req: NextRequest) {
  try {
    const {
      image_query,
      video_query,
      keyword,
      segment_id,
      content_age = "any",
    } = await req.json();

    const imgQuery = image_query || keyword || "general";
    const vidQuery = video_query || keyword || "general footage";

    const result = await searchMedia({
      imageQuery: imgQuery,
      videoQuery: vidQuery,
      imageCount: 10,
      videoCount: 5,
      contentAge: content_age,
      includeVideos: true,
    });

    return NextResponse.json({
      segment_id,
      images: result.images,
      videos: result.videos,
      sources_searched: result.sources,
      is_demo: result.is_demo,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}