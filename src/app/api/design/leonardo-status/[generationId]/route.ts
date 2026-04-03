import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ generationId: string }> },
) {
  try {
    const { generationId } = await params;
    const response = await fetch(
      `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
      {
        headers: { Authorization: `Bearer ${process.env.LEONARDO_API_KEY}` },
      },
    );

    const data = await response.json();
    const job = data.generations_by_pk;

    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (job.status === "COMPLETE") {
      return NextResponse.json({
        success: true,
        status: "COMPLETE",
        imageUrl: job.generated_images[0].url,
      });
    }

    if (job.status === "FAILED")
      return NextResponse.json(
        { success: false, status: "FAILED" },
        { status: 500 },
      );

    return NextResponse.json(
      { success: true, status: job.status },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json({ error: "Poll failed" }, { status: 500 });
  }
}
