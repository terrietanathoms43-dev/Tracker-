"use client";

import { DM_Sans, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { useEffect } from "react";
import { ErrorPage } from "@/components/error-page";
import { errorFields, log } from "@/lib/log";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const plusJakartaSans = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// This file replaces the root layout when the layout itself is what failed, so it carries its own
// document: fonts, global styles and the theme — applied from the same localStorage key next-themes
// writes. An effect rather than an inline <script>: React never executes scripts it renders client-side.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    log.error("global_error_boundary", { digest: error.digest, ...errorFields(error) });
    try {
      const theme = localStorage.getItem("theme");
      if (theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches)) {
        document.documentElement.classList.add("dark");
      }
    } catch {}
  }, [error]);
  return (
    <html lang="en" suppressHydrationWarning className={`${dmSans.variable} ${plusJakartaSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full">
        <title>Something went wrong</title>
        <main className="flex min-h-dvh items-center justify-center px-4">
          <div className="w-full max-w-sm">
            <ErrorPage onRetry={retry} />
          </div>
        </main>
      </body>
    </html>
  );
}
