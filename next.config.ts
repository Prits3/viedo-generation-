import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf.js runs as a plain Node module on the server (text extraction for uploads).
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
