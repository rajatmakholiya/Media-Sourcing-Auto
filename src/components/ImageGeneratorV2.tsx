"use client";

import React, { useState, useEffect, useRef } from 'react';
import AdminPortal from './AdminPortal';
import ThemeToggle from './ThemeToggle';

interface Preset {
  _id: string;
  name: string;
  seederPrompt: string;
  previewImage: string;
}

interface ResolutionOption {
  w: number;
  h: number;
  label: string;
  sub: string;
}

export default function ImageGeneratorV2() {
  const [formData, setFormData] = useState({
    provider: 'leonardo',
    presetStyle: '556c1ee5-ec38-42e8-955a-1e82dad0ffa1',
    presetId: '',
    story: '',
    mood: '',
    theme: '',
    aspectRatio: '1:1',
    width: 1024,
    height: 1024,
  });

  const [presets, setPresets] = useState<Preset[]>([]);
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Leonardo supported resolutions (Nano Banana 2)
  const resolutionOptions: Record<string, ResolutionOption[]> = {
    '1:1': [
      { w: 1024, h: 1024, label: '1K', sub: '1024x1024' },
      { w: 2048, h: 2048, label: '2K', sub: '2048x2048' },
      { w: 4096, h: 4096, label: '4K', sub: '4096x4096' },
    ],
    '2:3': [
      { w: 848, h: 1264, label: '1K', sub: '848x1264' },
      { w: 1696, h: 2528, label: '2K', sub: '1696x2528' },
      { w: 3392, h: 5056, label: '4K', sub: '3392x5056' },
    ],
    '3:2': [
      { w: 1264, h: 848, label: '1K', sub: '1264x848' },
      { w: 2528, h: 1696, label: '2K', sub: '2528x1696' },
      { w: 5056, h: 3392, label: '4K', sub: '5056x3392' },
    ],
    '3:4': [
      { w: 896, h: 1200, label: '1K', sub: '896x1200' },
      { w: 1792, h: 2400, label: '2K', sub: '1792x2400' },
      { w: 3584, h: 4800, label: '4K', sub: '3584x4800' },
    ],
    '4:3': [
      { w: 1200, h: 896, label: '1K', sub: '1200x896' },
      { w: 2400, h: 1792, label: '2K', sub: '2400x1792' },
      { w: 4800, h: 3584, label: '4K', sub: '4800x3584' },
    ],
    '4:5': [
      { w: 928, h: 1152, label: '1K', sub: '928x1152' },
      { w: 1856, h: 2304, label: '2K', sub: '1856x2304' },
      { w: 3712, h: 4608, label: '4K', sub: '3712x4608' },
    ],
    '5:4': [
      { w: 1152, h: 928, label: '1K', sub: '1152x928' },
      { w: 2304, h: 1856, label: '2K', sub: '2304x1856' },
      { w: 4608, h: 3712, label: '4K', sub: '4608x3712' },
    ],
    '9:16': [
      { w: 768, h: 1376, label: '1K', sub: '768x1376' },
      { w: 1536, h: 2752, label: '2K', sub: '1536x2752' },
      { w: 3072, h: 5504, label: '4K', sub: '3072x5504' },
    ],
    '16:9': [
      { w: 1376, h: 768, label: '1K', sub: '1376x768' },
      { w: 2752, h: 1536, label: '2K', sub: '2752x1536' },
      { w: 5504, h: 3072, label: '4K', sub: '5504x3072' },
    ],
    '21:9': [
      { w: 1584, h: 672, label: '1K', sub: '1584x672' },
      { w: 3168, h: 1344, label: '2K', sub: '3168x1344' },
      { w: 6336, h: 2688, label: '4K', sub: '6336x2688' },
    ],
  };

  const aspectRatios = [
    { id: '9:16', label: '9:16', type: 'portrait' },
    { id: '2:3', label: '2:3', type: 'portrait' },
    { id: '3:4', label: '3:4', type: 'portrait' },
    { id: '4:5', label: '4:5', type: 'portrait' },
    { id: '1:1', label: '1:1', type: 'square' },
    { id: '5:4', label: '5:4', type: 'landscape' },
    { id: '4:3', label: '4:3', type: 'landscape' },
    { id: '3:2', label: '3:2', type: 'landscape' },
    { id: '16:9', label: '16:9', type: 'landscape' },
    { id: '21:9', label: '21:9', type: 'landscape' },
  ];

  // Leonardo Preset Styles
  const leonardoStyles = [
    { id: '556c1ee5-ec38-42e8-955a-1e82dad0ffa1', name: 'None' },
    { id: 'debdf72a-91a4-467b-bf61-cc02bdeb69c6', name: '3D Render' },
    { id: '3cbb655a-7ca4-463f-b697-8a03ad67327c', name: 'Acrylic' },
    { id: '6fedbf1f-4a17-45ec-84fb-92fe524a29ef', name: 'Creative' },
    { id: '111dc692-d470-4eec-b791-3475abac4c46', name: 'Dynamic' },
    { id: '594c4a08-a522-4e0e-b7ff-e4dac4b6b622', name: 'Fashion' },
    { id: '09d2b5b5-d7c5-4c02-905d-9f84051640f4', name: 'Game Concept' },
    { id: '703d6fe5-7f1c-4a9e-8da0-5331f214d5cf', name: 'Graphic Design 2D' },
    { id: '7d7c2bc5-4b12-4ac3-81a9-630057e9e89f', name: 'Graphic Design 3D' },
    { id: '645e4195-f63d-4715-a3f2-3fb1e6eb8c70', name: 'Illustration' },
    { id: '8e2bc543-6ee2-45f9-bcd9-594b6ce84dcd', name: 'Portrait' },
    { id: '4edb03c9-8a26-4041-9d01-f85b5d4abd71', name: 'Portrait Cinematic' },
    { id: '0d34f8e1-46d4-428f-8ddd-4b11811fa7c9', name: 'Portrait Fashion' },
    { id: '22a9a7d2-2166-4d86-80ff-22e2643adbcf', name: 'Pro B&W Photography' },
    { id: '7c3f932b-a572-47cb-9b9b-f20211e63b5b', name: 'Pro Color Photography' },
    { id: '581ba6d6-5aac-4492-bebe-54c424a0d46e', name: 'Pro Film Photography' },
    { id: 'b504f83c-3326-4947-82e1-7fe9e839ec0f', name: 'Ray Traced' },
    { id: '5bdc3f2a-1be6-4d1c-8e77-992a30824a2c', name: 'Stock Photo' },
    { id: '1db308ce-c7ad-4d10-96fd-592fa6b75cc4', name: 'Watercolor' },
  ];

  // Mood options for media production
  const moodOptions = [
    'Cinematic & Dramatic',
    'Dark & Moody',
    'Bright & Energetic',
    'Warm & Nostalgic',
    'Cold & Intense',
    'Gritty & Raw',
    'Clean & Corporate',
    'Ethereal & Dreamy',
    'Bold & Aggressive',
    'Luxurious & Elegant',
  ];

  // Theme suggestion chips
  const themeSuggestions = [
    "Stadium Floodlights",
    "Smoke & Particles",
    "Lens Flare",
    "Film Grain",
    "Neon Glow",
    "Motion Blur",
    "Bokeh Background",
    "Rain Effects",
    "Golden Hour",
    "Spotlight Drama",
  ];

  useEffect(() => {
    fetchPresets();
  }, []);

  const fetchPresets = async () => {
    try {
      const res = await fetch('/api/design/presets');
      if (res.ok) {
        const data = await res.json();
        setPresets(data);
        if (data.length > 0) setFormData(prev => ({ ...prev, presetId: data[0]._id }));
      }
    } catch (error) {
      console.error("Failed to load presets", error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAspectRatioChange = (ratio: string) => {
    const options = resolutionOptions[ratio];
    const defaultRes = options[0];
    setFormData({
      ...formData,
      aspectRatio: ratio,
      width: defaultRes.w,
      height: defaultRes.h,
    });
  };

  const handleResolutionChange = (w: number, h: number) => {
    setFormData({ ...formData, width: w, height: h });
  };

  const handleThemeChipClick = (themeStr: string) => {
    const currentTheme = formData.theme;
    const newTheme = currentTheme ? `${currentTheme}, ${themeStr}` : themeStr;
    setFormData({ ...formData, theme: newTheme });
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
  };

  const processFile = (file: File) => {
    setSourceImage(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceImage) return alert("Please upload a source image.");
    if (!formData.story) return alert("Please describe the scene or action.");

    setIsGenerating(true);
    setGeneratedImage(null);

    const uploadData = new FormData();
    uploadData.append('image', sourceImage);
    uploadData.append('provider', formData.provider);
    uploadData.append('presetStyle', formData.presetStyle);
    uploadData.append('presetId', formData.presetId);
    uploadData.append('story', formData.story);
    uploadData.append('mood', formData.mood);
    uploadData.append('style', formData.theme);
    uploadData.append('width', formData.width.toString());
    uploadData.append('height', formData.height.toString());

    try {
      const response = await fetch('/api/design/generate', {
        method: 'POST',
        body: uploadData,
      });
      const result = await response.json();

      if (result.success && result.imageUrl) {
        setGeneratedImage(result.imageUrl);
      } else if (result.success && result.status === 'processing' && result.generationId) {
        const pollForResult = async (generationId: string, attempts = 0) => {
          if (attempts > 30) {
            alert("Generation timed out. Please try again.");
            setIsGenerating(false);
            return;
          }
          try {
            const pollRes = await fetch(`/api/design/leonardo-status/${generationId}`);
            const pollData = await pollRes.json();
            if (pollData.status === 'COMPLETE' && pollData.imageUrl) {
              setGeneratedImage(pollData.imageUrl);
              setIsGenerating(false);
            } else if (pollData.status === 'FAILED') {
              alert("Generation failed.");
              setIsGenerating(false);
            } else {
              setTimeout(() => pollForResult(generationId, attempts + 1), 3000);
            }
          } catch {
            setTimeout(() => pollForResult(generationId, attempts + 1), 5000);
          }
        };
        pollForResult(result.generationId);
        return;
      } else {
        alert(result.error || "Generation failed.");
      }
    } catch (error) {
      console.error("Generation failed:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex h-screen bg-white dark:bg-[#0a0a0f] overflow-hidden font-sans transition-colors">

      {/* LEFT PANEL */}
      <div className="w-[420px] min-w-[400px] bg-gray-50 dark:bg-[#111118] border-r border-gray-200 dark:border-[#1e1e28] flex flex-col overflow-hidden transition-colors">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-[#1e1e28] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7c5cfc] to-[#c084fc] flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 dark:text-white tracking-wide">STUDIO PRO</h1>
              <p className="text-[10px] text-gray-500 dark:text-[#71717a] font-medium tracking-wider uppercase">Media Production Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setShowAdmin(true)}
              className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-[#1c1c24] hover:bg-gray-200 dark:hover:bg-[#27272f] border border-gray-200 dark:border-[#27272f] flex items-center justify-center transition-colors group"
              title="Manage Presets"
            >
              <svg className="w-4 h-4 text-gray-400 dark:text-[#71717a] group-hover:text-[#7c5cfc] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          </div>
        </div>

        {/* Scrollable Controls */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* AI Engine */}
            <Section label="AI Engine" step="1">
              <div className="grid grid-cols-2 gap-2">
                <EngineButton
                  active={formData.provider === 'leonardo'}
                  onClick={() => setFormData({ ...formData, provider: 'leonardo' })}
                  label="Leonardo"
                  sublabel="HD Pro"
                  color="#7c5cfc"
                />
                <EngineButton
                  active={formData.provider === 'gemini'}
                  onClick={() => setFormData({ ...formData, provider: 'gemini' })}
                  label="Gemini"
                  sublabel="Fast"
                  color="#3b82f6"
                />
              </div>

              {/* Leonardo Style Presets */}
              {formData.provider === 'leonardo' && (
                <div className="mt-3 animate-fade-in">
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-[#52525b] uppercase tracking-wider mb-1.5">Render Style</label>
                  <select
                    name="presetStyle"
                    value={formData.presetStyle}
                    onChange={handleInputChange}
                    className="w-full rounded-lg bg-gray-100 dark:bg-[#1c1c24] border border-gray-200 dark:border-[#27272f] p-2 text-sm text-gray-700 dark:text-[#a1a1aa] focus:border-[#7c5cfc]/50 focus:ring-1 focus:ring-[#7c5cfc]/20 outline-none transition-all font-medium cursor-pointer"
                  >
                    {leonardoStyles.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </Section>

            {/* Style Presets from DB */}
            <Section label="Style Preset" step="2">
              <div className="grid grid-cols-3 gap-2">
                {presets.length === 0 ? (
                  <div className="col-span-3 text-center py-6 bg-gray-100 dark:bg-[#1c1c24] border border-dashed border-gray-300 dark:border-[#27272f] rounded-xl">
                    <p className="text-xs text-gray-400 dark:text-[#52525b] font-medium">No presets loaded</p>
                  </div>
                ) : (
                  presets.map(p => (
                    <div
                      key={p._id}
                      onClick={() => setFormData({ ...formData, presetId: p._id })}
                      className={`relative cursor-pointer rounded-lg overflow-hidden aspect-[4/5] border-2 transition-all group ${
                        formData.presetId === p._id
                          ? 'border-[#7c5cfc] shadow-[0_0_12px_rgba(124,92,252,0.2)]'
                          : 'border-gray-200 dark:border-[#27272f] hover:border-gray-300 dark:hover:border-[#33333d]'
                      }`}
                    >
                      <img src={p.previewImage} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex items-end p-2">
                        <span className="text-white text-[10px] font-bold leading-tight uppercase tracking-wide">{p.name}</span>
                      </div>
                      {formData.presetId === p._id && (
                        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#7c5cfc] flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Section>

            {/* Aspect Ratio & Resolution */}
            <Section label="Output Format" step="3">
              {/* Aspect Ratio Grid */}
              <div className="grid grid-cols-5 gap-1.5 mb-3">
                {aspectRatios.map(ar => (
                  <button
                    key={ar.id}
                    type="button"
                    onClick={() => handleAspectRatioChange(ar.id)}
                    className={`py-2 px-1 rounded-lg text-[10px] font-semibold border transition-all flex flex-col items-center gap-1 ${
                      formData.aspectRatio === ar.id
                        ? 'bg-[#7c5cfc]/10 border-[#7c5cfc]/40 text-[#7c5cfc] dark:text-[#c084fc]'
                        : 'bg-gray-100 dark:bg-[#1c1c24] border-gray-200 dark:border-[#27272f] text-gray-500 dark:text-[#71717a] hover:border-gray-300 dark:hover:border-[#33333d]'
                    }`}
                  >
                    <AspectIcon ratio={ar.id} active={formData.aspectRatio === ar.id} />
                    <span>{ar.label}</span>
                  </button>
                ))}
              </div>

              {/* Resolution (Small / Medium / Large) */}
              <div className="grid grid-cols-3 gap-2">
                {resolutionOptions[formData.aspectRatio].map(res => (
                  <button
                    key={`${res.w}x${res.h}`}
                    type="button"
                    onClick={() => handleResolutionChange(res.w, res.h)}
                    className={`py-2 px-2 rounded-lg text-center border transition-all ${
                      formData.width === res.w && formData.height === res.h
                        ? 'bg-[#7c5cfc]/10 border-[#7c5cfc]/40 text-[#7c5cfc] dark:text-[#c084fc]'
                        : 'bg-gray-100 dark:bg-[#1c1c24] border-gray-200 dark:border-[#27272f] text-gray-500 dark:text-[#52525b] hover:border-gray-300 dark:hover:border-[#33333d] hover:text-gray-600 dark:hover:text-[#71717a]'
                    }`}
                  >
                    <div className="text-xs font-bold">{res.label}</div>
                    <div className="text-[9px] opacity-60 mt-0.5">{res.sub}</div>
                  </button>
                ))}
              </div>
            </Section>

            {/* Story & Details */}
            <Section label="Scene Description" step="4">
              <textarea
                name="story"
                value={formData.story}
                onChange={handleInputChange}
                placeholder="Describe the scene, action, or subject in detail..."
                className="w-full rounded-lg bg-gray-100 dark:bg-[#1c1c24] border border-gray-200 dark:border-[#27272f] p-3 text-sm text-gray-800 dark:text-[#e4e4e7] placeholder-gray-400 dark:placeholder-[#3f3f46] focus:border-[#7c5cfc]/50 focus:ring-1 focus:ring-[#7c5cfc]/20 outline-none transition-all resize-none font-medium"
                rows={3}
              />
            </Section>

            {/* Mood */}
            <Section label="Mood & Tone" step="5">
              <select
                name="mood"
                value={formData.mood}
                onChange={handleInputChange}
                className="w-full rounded-lg bg-gray-100 dark:bg-[#1c1c24] border border-gray-200 dark:border-[#27272f] p-2.5 text-sm text-gray-600 dark:text-[#a1a1aa] focus:border-[#7c5cfc]/50 focus:ring-1 focus:ring-[#7c5cfc]/20 outline-none transition-all font-medium cursor-pointer"
              >
                <option value="">Select a mood...</option>
                {moodOptions.map(mood => (
                  <option key={mood} value={mood}>{mood}</option>
                ))}
              </select>
            </Section>

            {/* Extra Style Tags */}
            <Section label="Style Tags" step="6">
              <input
                type="text"
                name="theme"
                value={formData.theme}
                onChange={handleInputChange}
                placeholder="Add extra style details..."
                className="w-full rounded-lg bg-gray-100 dark:bg-[#1c1c24] border border-gray-200 dark:border-[#27272f] p-2.5 text-sm text-gray-800 dark:text-[#e4e4e7] placeholder-gray-400 dark:placeholder-[#3f3f46] focus:border-[#7c5cfc]/50 focus:ring-1 focus:ring-[#7c5cfc]/20 outline-none transition-all font-medium mb-2"
              />
              <div className="flex flex-wrap gap-1.5">
                {themeSuggestions.map(chip => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleThemeChipClick(chip)}
                    className="px-2.5 py-1 bg-gray-100 dark:bg-[#1c1c24] hover:bg-gray-200 dark:hover:bg-[#27272f] text-gray-500 dark:text-[#71717a] hover:text-gray-700 dark:hover:text-[#a1a1aa] rounded-md text-[10px] font-semibold transition-colors border border-gray-200 dark:border-[#27272f] hover:border-gray-300 dark:hover:border-[#33333d]"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </Section>

            {/* Generate Button */}
            <div className="pt-2 pb-4">
              <button
                type="submit"
                disabled={isGenerating || !sourceImage || !formData.story}
                className="w-full bg-gradient-to-r from-[#7c5cfc] to-[#a855f7] text-white font-bold uppercase tracking-widest py-3.5 px-4 rounded-xl hover:from-[#6a4de8] hover:to-[#9333ea] transition-all disabled:from-gray-200 disabled:to-gray-200 dark:disabled:from-[#27272f] dark:disabled:to-[#27272f] disabled:text-gray-400 dark:disabled:text-[#52525b] disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(124,92,252,0.25)] disabled:shadow-none active:scale-[0.98] text-sm"
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Rendering...
                  </span>
                ) : 'Generate'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* RIGHT PANEL: Canvas & Output */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-[#0a0a0f] transition-colors">

        {/* Upload Strip */}
        <div className="px-6 pt-5">
          <div className="bg-gray-50 dark:bg-[#111118] rounded-xl border border-gray-200 dark:border-[#1e1e28] p-1 transition-colors">
            <div
              className={`relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
                dragActive ? 'border-[#7c5cfc] bg-[#7c5cfc]/5' : 'border-gray-300 dark:border-[#27272f] hover:border-gray-400 dark:hover:border-[#33333d] hover:bg-gray-50 dark:hover:bg-[#141419]'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleChange} />

              {previewUrl ? (
                <div className="absolute inset-0 flex items-center justify-center p-2">
                  <img src={previewUrl} alt="Upload preview" className="h-full object-contain rounded-lg" />
                  <div className="absolute inset-0 bg-black/70 opacity-0 hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center backdrop-blur-sm">
                    <span className="text-white text-xs font-bold tracking-widest uppercase">Replace Image</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center">
                  <div className="bg-gray-100 dark:bg-[#1c1c24] p-2.5 rounded-lg border border-gray-200 dark:border-[#27272f] mb-2">
                    <svg className="w-5 h-5 text-gray-400 dark:text-[#71717a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-[#a1a1aa] font-semibold">Drop source image here</p>
                  <p className="text-[10px] text-gray-400 dark:text-[#52525b] mt-0.5">or click to browse</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Output Area */}
        <div className="flex-1 px-6 py-4 overflow-y-auto">
          <div className="bg-gray-50 dark:bg-[#111118] rounded-xl border border-gray-200 dark:border-[#1e1e28] min-h-[500px] flex flex-col overflow-hidden h-full transition-colors">

            {/* Output Header */}
            <div className="bg-gray-100 dark:bg-[#141419] border-b border-gray-200 dark:border-[#1e1e28] px-4 py-3 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-bold text-gray-500 dark:text-[#71717a] uppercase tracking-widest">Output</h3>
                {formData.width && formData.height && (
                  <span className="text-[10px] text-gray-400 dark:text-[#3f3f46] font-mono">{formData.width} x {formData.height}</span>
                )}
              </div>
              {generatedImage && (
                <a
                  href={generatedImage}
                  download="studio-pro-output.png"
                  className="text-[10px] font-bold text-[#7c5cfc] hover:text-white bg-[#7c5cfc]/10 hover:bg-[#7c5cfc] px-3 py-1.5 rounded-md transition-all uppercase tracking-wider border border-[#7c5cfc]/20 hover:border-[#7c5cfc]"
                >
                  Download HD
                </a>
              )}
            </div>

            {/* Output Canvas */}
            <div className="flex-1 flex items-center justify-center p-6 relative bg-gray-50 dark:bg-[#0c0c12] transition-colors" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.05) 1px, transparent 0)', backgroundSize: '24px 24px' }}>
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center gap-4">
                  <div className="w-14 h-14 border-[3px] border-gray-200 dark:border-[#27272f] border-t-[#7c5cfc] rounded-full animate-spin"></div>
                  <p className="text-xs font-bold text-gray-400 dark:text-[#52525b] uppercase tracking-widest animate-pulse">Generating...</p>
                </div>
              ) : generatedImage ? (
                <img src={generatedImage} alt="AI Generated" className="max-h-[600px] max-w-full w-auto rounded-lg shadow-2xl ring-1 ring-black/10 dark:ring-white/5" />
              ) : (
                <div className="text-center">
                  <svg className="w-12 h-12 text-gray-200 dark:text-[#1e1e28] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <p className="text-gray-300 dark:text-[#3f3f46] text-xs font-semibold uppercase tracking-widest">Awaiting Generation</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Admin Slide-Over Panel */}
      {showAdmin && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAdmin(false)} />
          <div className="relative w-[560px] max-w-full h-full animate-slide-in-right">
            <AdminPortal onClose={() => setShowAdmin(false)} onPresetsUpdated={fetchPresets} />
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable section wrapper
function Section({ label, step, children }: { label: string; step: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold text-gray-400 dark:text-[#52525b] uppercase tracking-[0.15em] flex items-center gap-2">
        <span className="bg-gray-100 dark:bg-[#1c1c24] text-gray-500 dark:text-[#71717a] w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold border border-gray-200 dark:border-[#27272f]">{step}</span>
        {label}
      </label>
      {children}
    </div>
  );
}

// Engine selector button
function EngineButton({ active, onClick, label, sublabel, color }: { active: boolean; onClick: () => void; label: string; sublabel: string; color: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-2.5 px-3 rounded-lg text-sm font-bold transition-all text-left ${
        active
          ? 'bg-gray-100 dark:bg-[#1c1c24] border-2 shadow-sm'
          : 'bg-white dark:bg-[#141419] border-2 border-gray-200 dark:border-[#1e1e28] text-gray-400 dark:text-[#52525b] hover:border-gray-300 dark:hover:border-[#27272f] hover:text-gray-500 dark:hover:text-[#71717a]'
      }`}
      style={active ? { borderColor: `${color}40`, color } : {}}
    >
      <div className="text-xs font-bold">{label}</div>
      <div className="text-[10px] opacity-60 mt-0.5">{sublabel}</div>
    </button>
  );
}

// Aspect ratio visual icon — draws a proportional rectangle
function AspectIcon({ ratio, active }: { ratio: string; active: boolean }) {
  const color = active ? '#7c5cfc' : '#71717a';
  const [w, h] = ratio.split(':').map(Number);
  const maxDim = 14;
  const scale = maxDim / Math.max(w, h);
  const rw = Math.round(w * scale);
  const rh = Math.round(h * scale);
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <rect
        x={(18 - rw) / 2}
        y={(18 - rh) / 2}
        width={rw}
        height={rh}
        rx="1"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
    </svg>
  );
}
