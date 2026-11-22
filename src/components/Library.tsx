"use client";

// Lessons stored on this server: finished ones open without any model call,
// unfinished runs can be resumed from their last checkpoint.
import { useEffect, useState } from "react";
import Link from "next/link";

interface Summary {
  id: string;
  title: string;
  kind: "pdf" | "text";
  format?: "pdf" | "text" | "docx" | "pptx";
  mode?: "full" | "short";
  seconds?: number;
  status: "running" | "interrupted" | "failed" | "done";
  stage: string;
  updatedAt: string;
  scenes?: number;
  voice?: string;
}

const FORMAT = { pdf: "PDF", text: "Text", docx: "Word", pptx: "Slides" };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function Library({ heading }: { heading: string }) {
  const [list, setList] = useState<Summary[] | null>(null);
  useEffect(() => {
    fetch("/api/lessons")
      .then((r) => r.json())
      .then((j) => setList(j.lessons ?? []))
      .catch(() => setList([]));
  }, []);
  if (!list || list.length === 0) return null;
  return (
    <section className="library" aria-labelledby="library-h" data-library={list.length}>
      <h2 id="library-h">{heading}</h2>
      <ul>
        {list.map((l) => (
          <li key={l.id} data-lesson={l.id} data-status={l.status} data-mode={l.mode ?? "full"}>
            {l.status === "done" ? (
              <Link href={`/lesson/${l.id}`} className="library__open">
                {l.title}
              </Link>
            ) : (
              <Link href={`/upload?resume=${l.id}`} className="library__open">
                {l.title}
              </Link>
            )}
            {l.mode === "short" && <span className="chip" style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)", fontWeight: 700 }}>Short</span>}
            <span className="chip">{FORMAT[l.format ?? l.kind]}</span>
            <span className="library__meta">
              {l.status === "done" ? `${l.scenes} scenes${l.seconds ? ` · ${clock(l.seconds)}` : ""} · ${l.voice === "browser" ? "browser voice" : "recorded voice"}` : l.status === "running" ? `generating (${l.stage})` : `stopped at "${l.stage}" · can be resumed`}
              {" · "}
              {l.updatedAt.slice(0, 16).replace("T", " ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
