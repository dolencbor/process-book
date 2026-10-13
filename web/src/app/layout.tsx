import type { Metadata } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { SanityLive } from "@/sanity/lib/live";
import "./globals.css";

const suisseIntlBook = localFont({
  src: "./fonts/SuisseIntl-Book.woff2",
  variable: "--font-suisse-intl-book",
  weight: "400",
  style: "normal",
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

const suisseIntlRegular = localFont({
  src: "./fonts/SuisseIntl-Regular.woff2",
  variable: "--font-suisse-intl-regular",
  weight: "400",
  style: "normal",
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

const suisseIntlMono = localFont({
  src: "./fonts/SuisseIntlMono-Regular-WebS.woff2",
  variable: "--font-suisse-intl-mono",
  weight: "400",
  style: "normal",
  display: "swap",
  fallback: ["Courier New", "monospace"],
});

export const metadata: Metadata = {
  title: { default: "Process Book", template: "%s | Process Book" },
  description: "Design projects and the process behind them.",
  icons: {
    icon: [
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: {
      url: "/favicon/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${suisseIntlBook.variable} ${suisseIntlRegular.variable} ${suisseIntlMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Suspense fallback={null}><SanityLive /></Suspense>
      </body>
    </html>
  );
}
