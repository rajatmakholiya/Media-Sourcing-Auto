// src/app/page.tsx
import Link from "next/link";

const tools = [
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
    id: "video-generator",
    title: "MSN Video Generator",
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
    id: "coming-soon",
    title: "Coming Soon",
    description: "A new tool is in development. Stay tuned for updates.",
    tags: ["TBD"],
    href: "#",
    color: "gray",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
];

const colorMap: Record<string, { bg: string; border: string; icon: string; tag: string; tagText: string; hover: string }> = {
  indigo: { bg: "bg-indigo-50", border: "border-indigo-200", icon: "text-indigo-600", tag: "bg-indigo-100", tagText: "text-indigo-700", hover: "hover:border-indigo-400 hover:shadow-md" },
  violet: { bg: "bg-violet-50", border: "border-violet-200", icon: "text-violet-600", tag: "bg-violet-100", tagText: "text-violet-700", hover: "hover:border-violet-400 hover:shadow-md" },
  gray: { bg: "bg-gray-50", border: "border-gray-200", icon: "text-gray-400", tag: "bg-gray-100", tagText: "text-gray-500", hover: "" },
};

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3">
        <span className="font-bold text-base text-indigo-500">ScriptVideo</span>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-gray-900">Production Tools</h1>
          <p className="text-sm text-gray-500 mt-2">
            AI-powered tools for media sourcing and video production
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tools.map((tool) => {
            const c = colorMap[tool.color];
            const isDisabled = tool.href === "#";

            const card = (
              <div
                className={`rounded-xl border ${c.border} ${c.bg} p-6 transition-all ${
                  isDisabled ? "opacity-50 cursor-not-allowed" : `cursor-pointer ${c.hover}`
                }`}
              >
                <div className={`w-12 h-12 rounded-lg bg-white border ${c.border} flex items-center justify-center mb-4 ${c.icon}`}>
                  {tool.icon}
                </div>
                <h2 className="text-base font-semibold text-gray-900 mb-1.5">{tool.title}</h2>
                <p className="text-xs text-gray-600 leading-relaxed mb-4">{tool.description}</p>
                <div className="flex flex-wrap gap-1">
                  {tool.tags.map((tag) => (
                    <span key={tag} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${c.tag} ${c.tagText}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );

            if (isDisabled) return <div key={tool.id}>{card}</div>;
            return <Link key={tool.id} href={tool.href}>{card}</Link>;
          })}
        </div>
      </main>
    </div>
  );
}