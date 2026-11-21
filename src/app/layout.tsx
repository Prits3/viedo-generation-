import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperScenes: research papers as narrated, visual lessons",
  description: "Turns a research paper into a narrated visual lesson. You control pace, sound, captions and motion, and every statement links to its passage in the original PDF.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a101d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
