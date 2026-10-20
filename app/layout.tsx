import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const plusJakartaSans = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
   title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
   description: APP_TAGLINE,
};

export const viewport: Viewport = {
   themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#fcfcfc" },
      { media: "(prefers-color-scheme: dark)", color: "#16171a" },
   ],
};

// The root layout only sets up fonts, theme, tooltips and toasts. Everything that depends on who is
// signed in lives inside app/(app)/layout.tsx behind <Suspense>.
export default function RootLayout({ children }: LayoutProps<"/">) {
   return (
      <html
         lang="en"
         suppressHydrationWarning
         className={`${dmSans.variable} ${plusJakartaSans.variable} ${geistMono.variable} h-full`}
      >
         <body className="min-h-full">
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
               <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
               <Toaster position="bottom-right" />
            </ThemeProvider>
         </body>
      </html>
   );
}
