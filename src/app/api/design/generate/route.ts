import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Preset from '@/models/Preset';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;
    const provider = formData.get('provider') as string;
    const presetId = formData.get('presetId') as string;
    const presetStyle = formData.get('presetStyle') as string;
    const story = formData.get('story') as string;
    const mood = formData.get('mood') as string;
    const style = formData.get('style') as string;
    const reqWidth = formData.get('width') as string;
    const reqHeight = formData.get('height') as string;

    if (!imageFile) return NextResponse.json({ error: 'Image required' }, { status: 400 });
    if (!story) return NextResponse.json({ error: 'Story required' }, { status: 400 });

    await dbConnect();

    let baseSeeder = 'Professional sports photography, intense action, 8k resolution';
    if (presetId) {
      try {
        const preset = await Preset.findById(presetId);
        if (preset) baseSeeder = preset.seederPrompt;
      } catch (e) { /* Ignore */ }
    }

    const moodTweak = mood ? `, Mood/Tone: ${mood}` : '';
    const styleTweak = style ? `, Style elements: ${style}` : '';
    const finalPrompt = `${baseSeeder}. Action/Subject: ${story}${moodTweak}${styleTweak}`;

    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ==========================================
    // GEMINI
    // ==========================================
    if (provider === 'gemini') {
      const base64Image = buffer.toString('base64');
      const vertexAiUrl = `https://${process.env.GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${process.env.GCP_PROJECT_ID}/locations/${process.env.GCP_LOCATION}/publishers/google/models/imagen-3.0-generate-001:predict`;

      const geminiResponse = await fetch(vertexAiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GCP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instances: [{ prompt: finalPrompt, image: { bytesBase64Encoded: base64Image } }],
          parameters: { sampleCount: 1 }
        })
      });

      const data = await geminiResponse.json();
      return NextResponse.json({
        success: true,
        imageUrl: `data:image/png;base64,${data.predictions[0].bytesBase64Encoded}`
      });
    }

    // ==========================================
    // LEONARDO AI
    // ==========================================
    if (provider === 'leonardo') {
      const leonardoApiKey = process.env.LEONARDO_API_KEY;
      if (!leonardoApiKey) return NextResponse.json({ error: 'API key missing' }, { status: 500 });

      const extension = imageFile.type.split('/')[1] || 'jpg';

      const initRes = await fetch('https://cloud.leonardo.ai/api/rest/v1/init-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${leonardoApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ extension })
      });
      const initData = await initRes.json();
      const uploadData = initData.uploadInitImage;
      const fields = JSON.parse(uploadData.fields);

      const s3FormData = new FormData();
      for (const key in fields) s3FormData.append(key, fields[key]);
      
      const blob = new Blob([buffer], { type: imageFile.type });
      s3FormData.append('file', blob, imageFile.name);

      await fetch(uploadData.url, { method: 'POST', body: s3FormData });

      const genPayload: any = {
        model: 'gemini-image-2',
        parameters: {
          width: parseInt(reqWidth, 10) || 1024,
          height: parseInt(reqHeight, 10) || 1024,
          prompt: finalPrompt,
          quantity: 1,
          guidances: {
            image_reference: [{ image: { id: uploadData.id, type: 'UPLOADED' }, strength: 'MID' }]
          },
          prompt_enhance: 'OFF'
        },
        public: false
      };

      if (presetStyle && presetStyle !== '556c1ee5-ec38-42e8-955a-1e82dad0ffa1') {
        genPayload.parameters.preset_style = presetStyle;
      }

      const genRes = await fetch('https://cloud.leonardo.ai/api/rest/v2/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${leonardoApiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(genPayload)
      });

      const genResData = await genRes.json();
      const resData = Array.isArray(genResData) ? genResData[0] : genResData;

      if (resData?.extensions?.code) {
        return NextResponse.json({ error: resData.extensions.details?.message }, { status: 400 });
      }

      const generationId = resData?.generate?.generationId || resData?.sdGenerationJob?.generationId || resData?.generationId || resData?.id;

      return NextResponse.json({
        success: true,
        status: 'processing',
        generationId,
      }, { status: 202 });
    }

  } catch (error: any) {
    return NextResponse.json({ error: 'Generation failed', details: error.message }, { status: 500 });
  }
}