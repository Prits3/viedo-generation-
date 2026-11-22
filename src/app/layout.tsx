import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LearnLayla: documents as narrated shorts you can check",
  description: "Turns a paper, a document or a text into a narrated visual short or lesson. You control pace, sound, captions and motion, and every statement links to its passage in the original PDF.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a101d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
