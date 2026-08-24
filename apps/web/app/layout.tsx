import type { Metadata, Viewport } from "next";
import { Montserrat, Open_Sans } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const openSans = Open_Sans({
  subsets: ["latin", "cyrillic"],
  variable: "--font-open-sans",
  display: "swap",
  preload: false
});

const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
  variable: "--font-montserrat",
  weight: ["600", "700"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "Lingua Bloom",
  description: "Проверяемые интерактивные уроки из материалов учителя",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#efe2ba" },
    { media: "(prefers-color-scheme: dark)", color: "#4056a1" }
  ],
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru" className={`${openSans.variable} ${montserrat.variable}`}>
      <body>{children}</body>
    </html>
  );
}
