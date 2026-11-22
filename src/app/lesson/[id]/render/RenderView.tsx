"use client";

// The video frame of a stored lesson. It reuses the player's scene components and the same state
// derivation (stateAt): the picture is a function of the time on the video clock.
//
// Time does not run here. The exporter calls window.__psRender.step(frame) for every frame; that
// sets the React state for the frame's time and moves every CSS transition and animation to the
// same time (each one is paused and placed at "video time since it began"). So gestures, reveals
// and fades are in the picture exactly as in the player, and the same frame number always gives
// the same picture, however long the screenshot takes.
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import type { Lesson } from "@/lib/types";
import { stateAt } from "@/lib/actions";
import { locLabel } from "@/lib/labels";
import { captionAt, frameTime, planVideo, positionAt, scenesWithoutNarration, sourceChip, VIDEO_FORMATS, type VideoFormat, type VideoPlan } from "@/lib/video-plan";
import { sourceLine } from "@/lib/share-caption";
import { LessonContext } from "@/components/LessonContext";
import { SceneView } from "@/components/scenes/SceneView";
import { DuckFigure, Mascot } from "@/components/Duck";

interface StoredFile {
  revision: number;
  provenance: { sourceName: string; sourceFormat?: "pdf" | "text" | "docx" | "pptx" };
  lesson: Lesson;
}

export interface RenderInfo {
  id: string;
  revision: number;
  format: VideoFormat;
  fps: number;
  frames: number;
  duration: number;
  content: number;
  endCard: number;
  width: number;
  height: number;
  withoutNarration: string[];
}

interface RenderApi {
  ready: boolean;
  error?: string;
  info?: RenderInfo;
  /** Shows a frame; resolves when its images are decoded. */
  step?: (frame: number) => Promise<void>;
  /** Runs through the frames before `frame` without waiting, so animations are where they would be. */
  preroll?: (frame: number) => void;
}

declare global {
  interface Window {
    __psRender?: RenderApi;
  }
}

interface Props {
  id: string;
  format: VideoFormat;
  maxSeconds?: number;
  endCard?: number;
  fromScene?: string;
  /** Show this moment (seconds) when the page is opened by a person. */
  at?: number;
}

/** Puts every running CSS transition and animation on the video clock. */
function createAnimationClock() {
  const born = new WeakMap<Animation, number>();
  return (T: number) => {
    // getAnimations() applies pending style changes first, so transitions started by this frame's
    // state are in the list and begin at this frame's time.
    for (const a of document.getAnimations()) {
      if (a.playState === "finished") continue;
      let began = born.get(a);
      if (began === undefined) {
        began = T;
        born.set(a, began);
      }
      const ms = (T - began) * 1000;
      const end = a.effect?.getComputedTiming().endTime;
      if (typeof end === "number" && Number.isFinite(end) && ms >= end) {
        a.finish();
        continue;
      }
      a.pause();
      a.currentTime = ms;
    }
  };
}

export function RenderView({ id, format, maxSeconds, endCard, fromScene, at }: Props) {
  const [file, setFile] = useState<StoredFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [T, setT] = useState(0);

  useEffect(() => {
    // The frame never changes size, and observers report on the browser's own clock (one real
    // frame later), which would make a picture depend on when it was taken. Layout is measured
    // inside step() only, so they are switched off on this page.
    const Original = window.ResizeObserver;
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    return () => {
      window.ResizeObserver = Original;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/lessons/${id}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => alive && (ok ? setFile(body) : setError(body.title ?? "The lesson could not be loaded")))
      .catch(() => alive && setError("The lesson could not be loaded"));
    return () => {
      alive = false;
    };
  }, [id]);

  const planned = useMemo<{ plan?: VideoPlan; error?: string }>(() => {
    if (!file) return {};
    try {
      const plan = planVideo(file.lesson, { maxSeconds, endCard, fromScene });
      return plan.scenes.length ? { plan } : { error: "This lesson has no scenes to show." };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [file, maxSeconds, endCard, fromScene]);
  const plan = planned.plan;
  const problem = error ?? planned.error;
  const size = VIDEO_FORMATS[format];

  useEffect(() => {
    if (problem) {
      window.__psRender = { ready: false, error: problem };
      return;
    }
    if (!file || !plan) return;
    let alive = true;
    const sync = createAnimationClock();
    const show = (frame: number) => {
      const time = frameTime(frame, plan.fps);
      flushSync(() => setT(time));
      sync(time);
    };
    const settle = async () => {
      const waiting = Array.from(document.images).filter((img) => !img.complete);
      if (waiting.length) await Promise.all(waiting.map((img) => img.decode().catch(() => undefined)));
    };
    const info: RenderInfo = { id, revision: file.revision, format, fps: plan.fps, frames: plan.frames, duration: plan.duration, content: plan.content, endCard: plan.endCard, width: size.width, height: size.height, withoutNarration: scenesWithoutNarration(plan) };
    const api: RenderApi = {
      ready: false,
      info,
      preroll: (frame) => {
        for (let f = 0; f < frame; f++) show(f);
      },
      step: async (frame) => {
        show(frame);
        await settle();
      },
    };
    window.__psRender = api;
    // Figures are fetched before the first frame, so a figure scene never starts with an empty box.
    const figures = plan.scenes.map((p) => p.scene.figure?.src).filter((src): src is string => Boolean(src));
    const preload = figures.map((src) => {
      const img = new Image();
      img.src = src;
      return img.decode().catch(() => undefined);
    });
    Promise.all([document.fonts.ready, ...preload]).then(async () => {
      if (!alive) return;
      if (at !== undefined) {
        const frame = Math.min(plan.frames - 1, Math.floor(at * plan.fps));
        api.preroll?.(frame);
        await api.step?.(frame);
      } else show(0);
      api.ready = true;
    });
    return () => {
      alive = false;
      delete window.__psRender;
    };
  }, [file, plan, problem, id, format, size.width, size.height, at]);

  const ctx = useMemo(() => {
    const byId = new Map((file?.lesson.inventory ?? []).map((it) => [it.id, it]));
    const kind = file?.lesson.meta.sourceKind;
    return { item: (ref: string | undefined) => (ref ? byId.get(ref) : undefined), openSource: () => {}, loc: (n: number) => locLabel(kind, n) };
  }, [file]);

  const frameStyle = { width: size.cssWidth, height: size.cssHeight };
  if (problem || !file || !plan)
    return (
      <div className={`rv rv--${format}`} style={frameStyle} data-render-state={problem ? "error" : "loading"}>
        <p className="rv-message">{problem ?? "Loading the lesson…"}</p>
      </div>
    );

  const { lesson } = file;
  const pos = positionAt(plan, T);
  const scene = plan.scenes[pos.index].scene;
  const state = stateAt(scene, pos.t);
  const cue = state.step >= 0 ? scene.cues[state.step] : undefined;
  const caption = pos.ended ? null : captionAt(cue, pos.t, size.captionChars);
  // Before the first sentence the chip already names the source of that sentence.
  const chip = sourceChip(lesson, cue ?? scene.cues[0]);
  // Some statement scenes carry the statement as their heading too; the frame shows it once.
  const same = (a?: string, b?: string) => Boolean(a && b && a.replace(/\W+/g, "").toLowerCase() === b.replace(/\W+/g, "").toLowerCase());
  const repeatedHead = scene.type === "statement" && same(scene.question, scene.statement?.text);

  return (
    <LessonContext.Provider value={ctx}>
      <div className={`rv rv--${format}`} style={frameStyle} data-reduced="false" data-render-state="ready" data-scene={scene.id} data-step={state.step} data-ended={pos.ended ? "true" : "false"}>
        <div className="stage rv-stage" data-scene-type={scene.type} data-repeated-head={repeatedHead ? "true" : undefined}>
          <SceneView key={scene.id} scene={scene} state={state} reduced={false} />
          {scene.type !== "establishing" && <Mascot pose={state.mascot.pose} target={state.mascot.target} sceneKey={`${scene.id}:${lesson.id}`} />}
          <div className="rv-top">
            <span className="rv-ai">AI-generated</span>
          </div>
          <div className="rv-bottom">
            <div className="rv-chip" data-source={chip.where}>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M4 1.5h5.5L13 5v9.5H4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M9.5 1.5V5H13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              {chip.where ? (
                <>
                  <strong>Source: {chip.where}</strong>
                  <span>{chip.title}</span>
                </>
              ) : (
                <span>{chip.title || "No source claim"}</span>
              )}
            </div>
            <div className="rv-caption" data-part={caption ? `${caption.part + 1}/${caption.parts}` : ""}>
              {caption && <p>{caption.text}</p>}
            </div>
          </div>
          {pos.ended && (
            <div className="rv-end">
              <svg className="rv-end__duck" viewBox="0 0 120 132" role="presentation" focusable="false">
                <DuckFigure pose="wow" aim={-12} />
              </svg>
              <p className="rv-end__brand">
                <i aria-hidden="true" />
                PaperScenes
              </p>
              <p className="rv-end__line">Every claim links to its source</p>
              <p className="rv-end__title">{lesson.meta.title}</p>
              <p className="rv-end__source">Source: {sourceLine(lesson, file.provenance.sourceName, file.provenance.sourceFormat)}</p>
              <p className="rv-end__ai">AI-generated video · synthetic voice</p>
            </div>
          )}
        </div>
      </div>
    </LessonContext.Provider>
  );
}
