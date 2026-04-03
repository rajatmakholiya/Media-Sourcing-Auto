import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

const tools = [
  {
    id: "video-generator",
    title: "Video Generator",
    description: "Full pipeline: script segmentation, voiceover, media selection, and automated video assembly with captions, transitions, and Ken Burns effects.",
    tags: ["Script-to-Video", "Remotion", "FFmpeg", "TTS"],
    href: "/tools/video-generator",
    color: "violet",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
  },
  {
    id: "media-sourcing",
    title: "Media Sourcing Assistant",
    description: "Enter a script, auto-generate keywords, search Imagn/Imago/Google for media, select the best options, and export a curated media list.",
    tags: ["MSN Slideshow", "Imagn", "Imago", "Google"],
    href: "/tools/media-sourcing",
    color: "indigo",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
  },
  {
    id: "graphic-design",
    title: "AI Graphic Studio",
    description: "Generate high-fidelity imagery using Leonardo AI and Google Gemini. Style presets, mood controls, multi-resolution output up to 4K.",
    tags: ["Leonardo AI", "Gemini", "Image Gen", "Presets"],
    href: "/tools/graphic-design",
    color: "purple",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

const colorMap: Record<string, { bg: string; border: string; icon: string; tag: string; tagText: string; hover: string }> = {
  indigo: { bg: "bg-indigo-50 dark:bg-indigo-500/5", border: "border-indigo-200 dark:border-indigo-500/20", icon: "text-indigo-600 dark:text-indigo-400", tag: "bg-indigo-100 dark:bg-indigo-500/10", tagText: "text-indigo-700 dark:text-indigo-300", hover: "hover:border-indigo-400 dark:hover:border-indigo-500/40 hover:shadow-md" },
  violet: { bg: "bg-violet-50 dark:bg-violet-500/5", border: "border-violet-200 dark:border-violet-500/20", icon: "text-violet-600 dark:text-violet-400", tag: "bg-violet-100 dark:bg-violet-500/10", tagText: "text-violet-700 dark:text-violet-300", hover: "hover:border-violet-400 dark:hover:border-violet-500/40 hover:shadow-md" },
  purple: { bg: "bg-purple-50 dark:bg-purple-500/5", border: "border-purple-200 dark:border-purple-500/20", icon: "text-purple-600 dark:text-purple-400", tag: "bg-purple-100 dark:bg-purple-500/10", tagText: "text-purple-700 dark:text-purple-300", hover: "hover:border-purple-400 dark:hover:border-purple-500/40 hover:shadow-md" },
  gray: { bg: "bg-gray-50 dark:bg-gray-500/5", border: "border-gray-200 dark:border-gray-500/20", icon: "text-gray-400 dark:text-gray-500", tag: "bg-gray-100 dark:bg-gray-500/10", tagText: "text-gray-500 dark:text-gray-400", hover: "" },
};

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-gray-50 dark:bg-[#0a0a0f] transition-colors">
      {/* Theme Toggle — top right */}
      <div className="fixed top-5 right-5 z-50">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-5xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7c5cfc] to-[#c084fc] flex items-center justify-center shadow-lg shadow-purple-500/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Studio Pro</h1>
          <p className="text-sm text-gray-500 dark:text-[#71717a] mt-1 font-medium">Media Production Engine</p>
        </div>

        {/* Tool Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map(tool => {
            const colors = colorMap[tool.color] || colorMap.gray;
            return (
              <Link
                key={tool.id}
                href={tool.href}
                className={`group block p-6 rounded-2xl border-2 ${colors.bg} ${colors.border} ${colors.hover} transition-all duration-200`}
              >
                {/* Icon */}
                <div className={`${colors.icon} mb-4 group-hover:scale-110 transition-transform duration-200`}>
                  {tool.icon}
                </div>

                {/* Title */}
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{tool.title}</h2>

                {/* Description */}
                <p className="text-sm text-gray-500 dark:text-[#71717a] leading-relaxed mb-4">{tool.description}</p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {tool.tags.map(tag => (
                    <span key={tag} className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${colors.tag} ${colors.tagText}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
