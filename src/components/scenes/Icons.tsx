// Line icons used by flow and point scenes. One visual language: 1.6px strokes, round joins.
import type { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  satellite: (
    <>
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" transform="rotate(45 12 12)" />
      <path d="M6.5 6.5 3 10l3 3 3.5-3.5M17.5 17.5 21 14l-3-3-3.5 3.5M4 18a4 4 0 0 0 4 2M3.5 20.5h.01" />
    </>
  ),
  city: <path d="M3 21V9l5-2v14M8 21V4l7 3v14M15 21V11l6 2v8M2 21h20M11 9h1M11 13h1M11 17h1M5.5 12h.01M5.5 16h.01M18 16h.01" />,
  layers: <path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" />,
  model: <path d="M3 20h18M4 16c3 0 3-9 6-9s3 6 5 6 2-8 5-8" />,
  delta: <path d="M12 4 3.5 20h17L12 4Z" />,
  grid: <path d="M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" />,
  tree: <path d="M12 21v-6M12 15a5.5 5.5 0 0 1-4.6-8.5A4.5 4.5 0 0 1 12 3a4.5 4.5 0 0 1 4.6 3.5A5.5 5.5 0 0 1 12 15ZM9 21h6" />,
  doc: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" />,
  clock: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2" />,
  chart: <path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3" />,
  thermo: <path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0ZM12 9v8" />,
  cloud: <path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 9.5 4.3 4.3 0 0 1 17.5 18H7ZM4 4l16 16" />,
  shade: <path d="M4 12a8 8 0 0 1 16 0H4ZM12 12v7a2 2 0 0 0 4 0M12 4V2.5" />,
  scale: <path d="M12 4v16M7 20h10M5 7h14M5 7l-2.5 6a3 3 0 0 0 5 0L5 7ZM19 7l-2.5 6a3 3 0 0 0 5 0L19 7Z" />,
  check: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12.5l2.8 2.8L16 9.5" />,
  search: <path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 21 21" />,
  leaf: <path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15M5 19l8-8" />,
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.500 6-11 6-11Z" />,
  sun: <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2.5M12 19.500V22M2 12h2.500M19.500 12H22M5 5l1.800 1.800M17.200 17.200 19 19M19 5l-1.800 1.800M6.800 17.200 5 19" />,
};

export function Icon({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] ?? paths.doc}
    </svg>
  );
}
