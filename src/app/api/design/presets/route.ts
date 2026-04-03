import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Preset from '@/models/Preset';

export async function GET() {
  try {
    await dbConnect();
    const presets = await Preset.find().sort({ createdAt: -1 });
    return NextResponse.json(presets, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch presets' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { name, seederPrompt, previewImage } = body;
    
    if (!name || !seederPrompt || !previewImage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newPreset = new Preset({ name, seederPrompt, previewImage });
    await newPreset.save();
    
    return NextResponse.json({ message: 'Preset added', preset: newPreset }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ error: 'Name already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to add preset' }, { status: 500 });
  }
}