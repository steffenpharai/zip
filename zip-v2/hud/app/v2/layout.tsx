import type { Metadata } from "next";
import { JetBrains_Mono, IBM_Plex_Sans_Condensed } from "next/font/google";

const jbMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "800"],
  variable: "--font-jb-mono",
  display: "swap",
});

const plexCond = IBM_Plex_Sans_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-cond",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZIP // V2 — Operator Console",
  description: "On-robot Jetson, observed and controlled.",
};

export default function V2Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${jbMono.variable} ${plexCond.variable} zip-v2 zip-v2-bg min-h-screen`}>
      {children}
    </div>
  );
}
