import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Preset from "@/models/Preset";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await dbConnect();
    const deletedPreset = await Preset.findByIdAndDelete(id);
    if (!deletedPreset)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ message: "Deleted" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
