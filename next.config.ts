import type { NextConfig } from "next";

const BACKEND = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8787";

const nextConfig: NextConfig = {
  // pdf.js runs as a plain Node module on the server (text extraction for uploads).
  serverExternalPackages: ["pdfjs-dist"],
  // Development proxy: the browser calls same-origin /backend/*, Next forwards it
  // to Pritika's FastAPI service. No CORS, and the model key never reaches the client.
  async rewrites() {
    return [{ source: "/backend/:path*", destination: `${BACKEND}/:path*` }];
  },
};

export default nextConfig;
