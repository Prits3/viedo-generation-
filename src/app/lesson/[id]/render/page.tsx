// /lesson/<id>/render: the stage alone, composed for video (9:16 by default, ?format=landscape for 16:9).
// The exporter (scripts/export-video.mjs) opens this page, steps it frame by frame and takes a
// picture of every frame. ?t=<seconds> shows one moment for a look in a normal browser.
import type { Metadata } from "next";
import { RenderView } from "./RenderView";
import "./render.css";

export const metadata: Metadata = { title: "Video frame | LearnLayla", robots: { index: false } };

type Query = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function RenderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Query }) {
  const { id } = await params;
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  const num = (k: string) => {
    const v = Number(one(k));
    return one(k) !== undefined && Number.isFinite(v) && v >= 0 ? v : undefined;
  };
  return <RenderView id={id} format={one("format") === "landscape" ? "landscape" : "vertical"} maxSeconds={num("max")} endCard={num("end")} fromScene={one("from")} at={num("t")} />;
}
