// src/components/ui/index.tsx
// Shared UI primitives used across all pipeline steps

import { ReactNode, ButtonHTMLAttributes, TextareaHTMLAttributes } from "react";

// --- Badge ---
type BadgeVariant = "keyword" | "duration" | "words" | "fallback" | "success" | "info";

const badgeStyles: Record<BadgeVariant, string> = {
  keyword: "bg-indigo-50 text-indigo-700 border-indigo-200",
  duration: "bg-amber-50 text-amber-800 border-amber-200",
  words: "bg-green-50 text-green-800 border-green-200",
  fallback: "bg-yellow-50 text-yellow-800 border-yellow-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
};

export function Badge({
  children,
  variant = "keyword",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeStyles[variant]}`}
    >
      {children}
    </span>
  );
}

// --- Card ---
export function Card({
  children,
  className = "",
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 ${
        flush ? "" : "p-5"
      } ${className}`}
    >
      {children}
    </div>
  );
}

// --- Button ---
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300";
  const variants = {
    primary: "px-5 py-2.5 bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-500 text-sm",
    secondary: "px-3.5 py-2 border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-xs font-medium",
    ghost: "px-3 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 text-xs",
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

// --- Textarea ---
export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full min-h-[150px] p-3.5 rounded-lg border border-gray-200 text-sm leading-relaxed resize-y font-inherit bg-white text-gray-900 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-400 ${className}`}
      {...props}
    />
  );
}

// --- Spinner ---
export function Spinner({ size = 36 }: { size?: number }) {
  return (
    <div
      className="border-3 border-gray-200 border-t-indigo-500 rounded-full animate-spin"
      style={{ width: size, height: size, borderWidth: 3 }}
    />
  );
}

// --- Status Dot ---
export function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        online
          ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]"
          : "bg-red-400"
      }`}
    />
  );
}

// --- Step Number Circle ---
export function StepNumber({
  n,
  active = false,
}: {
  n: number;
  active?: boolean;
}) {
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        active
          ? "bg-indigo-500 text-white"
          : "bg-gray-100 text-gray-400"
      }`}
    >
      {n}
    </div>
  );
}