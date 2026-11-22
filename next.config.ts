import type { NextConfig } from "next";

// The bundled example lessons are read with dynamic paths, which file tracing cannot see.
// Include them in the routes that serve lessons, so a serverless deployment has them on disk.
const showcase = ["./showcase/**/*"];

const nextConfig: NextConfig = {
  // pdf.js and its canvas backend run as plain Node modules on the server
  // (text extraction for uploads, page rendering for original figures).
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/lessons": showcase,
    "/api/lessons/**": showcase,
    "/lesson/**": showcase,
  },
};

export default nextConfig;
