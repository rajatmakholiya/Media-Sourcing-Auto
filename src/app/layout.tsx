// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Studio Pro — Media Production Engine",
  description: "AI-powered graphics engine and video production pipeline",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var theme = localStorage.getItem('theme');
              if (theme === 'light') return;
              if (theme === 'dark' || window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.documentElement.classList.add('dark');
              }
            } catch(e) {}
          })();
        `}} />
      </head>
      <body className={`${inter.className} bg-white dark:bg-[#0a0a0f] min-h-screen text-gray-900 dark:text-white transition-colors`}>
        <main className="h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
