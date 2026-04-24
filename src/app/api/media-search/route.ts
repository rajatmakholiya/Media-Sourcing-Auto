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
      allow_non_licensed = false,
      search_entities,
      exclude_terms,
      alternate_queries,
      subject,
    } = await req.json();

    const imgQuery = image_query || keyword || "general";
    const vidQuery = video_query || keyword || "general footage";

    const altImage = Array.isArray(alternate_queries?.image) ? alternate_queries.image : [];
    const altVideo = Array.isArray(alternate_queries?.video) ? alternate_queries.video : [];

    // Editorial archives (Imago/Imagn) don't index narrow visual moments like
    // "countdown board" — they index subjects like "NFL Draft 2025". When the
    // AI supplies a meaningful subject, pass it through so those providers use
    // the broader query.
    const editorialQuery =
      typeof subject === "string" && subject.trim().length >= 3 && subject.trim() !== imgQuery.trim()
        ? subject.trim()
        : undefined;

    const result = await searchMedia({
      imageQuery: imgQuery,
      videoQuery: vidQuery,
      editorialQuery,
      imageCount: 10,
      videoCount: 5,
      contentAge: content_age,
      includeVideos: true,
      allowNonLicensed: allow_non_licensed,
      searchEntities: Array.isArray(search_entities) ? search_entities : [],
      excludeTerms: Array.isArray(exclude_terms) ? exclude_terms : [],
      alternateImageQueries: altImage,
      alternateVideoQueries: altVideo,
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