import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeWrapper } from "@/components/ThemeWrapper";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZIP",
  description: "ZIP HUD Assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = localStorage.getItem('zip-theme') || 'dark';
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
                const projector = localStorage.getItem('zip-projector');
                if (projector === 'true') {
                  document.documentElement.classList.add('projector');
                } else {
                  document.documentElement.classList.remove('projector');
                }
              })();
            `,
          }}
        />
      </head>
      <body className={inter.variable}>
        <ThemeWrapper>{children}</ThemeWrapper>
      </body>
    </html>
  );
}

