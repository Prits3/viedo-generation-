import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf.js and its canvas backend run as plain Node modules on the server
  // (text extraction for uploads, page rendering for original figures).
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
