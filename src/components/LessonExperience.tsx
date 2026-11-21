"use client";

// The lesson page: player, source view (beside the player on desktop, collapsible below on phones),
// coverage map, detail views and source appendix.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Lesson, Scene } from "@/lib/types";
import { analyzeCoverage, type SceneRef } from "@/lib/coverage";
import { formatTime, locLabel } from "@/lib/labels";
import { stateAt } from "@/lib/actions";
import { LessonContext } from "./LessonContext";
import { usePlayback } from "./usePlayback";
import { SceneView } from "./scenes/SceneView";
import { Mascot } from "./Duck";
import { SourcePanel } from "./SourcePanel";
import { CoverageMap } from "./CoverageMap";
import { DetailSections } from "./DetailSections";
import { VerificationBadge } from "./VerificationBadge";

interface Entry {
  scene: Scene;
  /** -1 = intro */
  chapterIndex: number;
}

const RATES = [0.75, 1, 1.25, 1.5];
const REGENERABLE: Scene["type"][] = ["question", "statement", "points", "flow", "milestones", "comparison"];

interface Props {
  lesson: Lesson;
  notice?: React.ReactNode;
  /** Stored lessons: generates one scene again. Resolves to an error text, or null on success. */
  onRegenerate?: (sceneId: string) => Promise<string | null>;
  /** Extra controls shown inside the player, below the scene list (stored lessons: video export). */
  playerExtras?: React.ReactNode;
}

function usePreference(key: string, initial: boolean | null): [boolean | null, (v: boolean) => void] {
  const [value, setValue] = useState<boolean | null>(initial);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === "1" || raw === "0") setValue(raw === "1");
    } catch {
      /* storage unavailable */
    }
  }, [key]);
  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, v ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
    },
    [key],
  );
  return [value, set];
}

export function LessonExperience({ lesson, notice, onRegenerate, playerExtras }: Props) {
  const coverage = useMemo(() => analyzeCoverage(lesson), [lesson]);
  const byId = useMemo(() => new Map(lesson.inventory.map((it) => [it.id, it])), [lesson]);
  const playlist = useMemo<Entry[]>(
    () => [...lesson.intro.scenes.map((scene) => ({ scene, chapterIndex: -1 })), ...lesson.chapters.flatMap((c, k) => c.scenes.map((scene) => ({ scene, chapterIndex: k })))],
    [lesson],
  );
  const scenes = useMemo(() => playlist.map((e) => e.scene), [playlist]);
  const introCount = lesson.intro.scenes.length;

  const [introDone, setIntroDone] = useState(false);
  const pb = usePlayback(scenes, {
    browserVoice: !lesson.hasRecordedVoice,
    onSceneEnd: (i) => {
      // The intro stops at its end and offers the full paper instead of rolling on.
      if (i === introCount - 1) {
        setIntroDone(true);
        return false;
      }
      return true;
    },
  });

  // Viewer preferences.
  const [captionsPref, setCaptions] = usePreference("pl.captions", null);
  const captions = captionsPref ?? !lesson.hasRecordedVoice;
  const [motionPref, setMotionPref] = usePreference("pl.reducedMotion", null);
  const [systemReduced, setSystemReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setSystemReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const reduced = motionPref ?? systemReduced;

  // Source panel state.
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [tab, setTab] = useState<"source" | "index">("source");
  const [panelOpen, setPanelOpen] = useState(false);
  const [openSection, setOpenSection] = useState<{ id: string; item?: string } | null>(null);
  // True while playback is paused because a source was opened from the running video.
  const [held, setHeld] = useState(false);
  const [regen, setRegen] = useState<{ id: string; error?: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  const isNarrow = () => window.matchMedia("(max-width: 1099px)").matches;
  const scrollTo = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });

  const openSource = useCallback(
    (id: string) => {
      setSelectedId(id);
      setTab("source");
      setPanelOpen(true);
      if (pb.playing) setHeld(true);
      pb.pause();
      if (isNarrow()) requestAnimationFrame(() => scrollTo(panelRef.current));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pb.pause, pb.playing, reduced],
  );

  // Close the source and go on at the same moment of the same scene.
  const resumeFromSource = useCallback(() => {
    setHeld(false);
    setSelectedId(undefined);
    if (isNarrow()) {
      setPanelOpen(false);
      scrollTo(playerRef.current);
    }
    pb.play();
    playerRef.current?.querySelector<HTMLElement>(".stage")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pb.play, reduced]);
  useEffect(() => {
    if (pb.playing) setHeld(false);
  }, [pb.playing, pb.index]);
  useEffect(() => {
    if (!held) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && resumeFromSource();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [held, resumeFromSource]);

  const jumpToScene = useCallback(
    (ref: SceneRef) => {
      const idx = playlist.findIndex((e) => e.scene.id === ref.sceneId);
      if (idx < 0) return;
      const cue = playlist[idx].scene.cues[ref.cueIndex];
      setIntroDone(false);
      setHeld(false);
      pb.goTo(idx, Math.max(0, (cue?.start ?? 0) - 0.05), true);
      requestAnimationFrame(() => {
        scrollTo(playerRef.current);
        playerRef.current?.querySelector<HTMLElement>(".stage")?.focus({ preventScroll: true });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playlist, pb.goTo, reduced],
  );

  const openDetail = useCallback(
    (sectionId: string, itemId: string) => {
      setOpenSection({ id: sectionId, item: itemId });
      pb.pause();
      requestAnimationFrame(() => requestAnimationFrame(() => scrollTo(document.getElementById(`item-${sectionId}-${itemId}`) ?? document.getElementById(sectionId))));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pb.pause, reduced],
  );

  const entry = playlist[pb.index];
  const scene = entry.scene;
  const sceneState = useMemo(() => stateAt(scene, pb.started ? pb.t : -1), [scene, pb.started, pb.t]);
  const step = sceneState.step;
  const cue = step >= 0 ? scene.cues[step] : undefined;
  const duration = scene.duration ?? 0;
  const inIntro = entry.chapterIndex < 0;
  const showEndCard = inIntro && introDone && !pb.playing;
  const showStart = !pb.started;

  const firstOf = (chapterIndex: number) => playlist.findIndex((e) => e.chapterIndex === chapterIndex);
  const chapterScenes = playlist.map((e, i) => ({ ...e, i })).filter((e) => e.chapterIndex === entry.chapterIndex);
  const chapterTotal = chapterScenes.reduce((s, e) => s + (e.scene.duration ?? 0), 0);
  const chapterElapsed = chapterScenes.filter((e) => e.i < pb.index).reduce((s, e) => s + (e.scene.duration ?? 0), 0) + pb.t;
  const introTotal = lesson.intro.scenes.reduce((s, sc) => s + (sc.duration ?? 0), 0);

  const watchFull = () => {
    setIntroDone(false);
    pb.goTo(introCount, 0, true);
  };
  const goChapter = (k: number) => {
    setIntroDone(false);
    pb.goTo(firstOf(k), 0, true);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const isButton = tag === "BUTTON" || tag === "A";
    if ((e.key === " " && !isButton) || e.key === "k" || e.key === "K") {
      e.preventDefault();
      pb.toggle();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      pb.seek(pb.t + 5);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      pb.seek(pb.t - 5);
    } else if (e.key === "n" || e.key === "N") pb.goTo(pb.index + 1, 0);
    else if (e.key === "p" || e.key === "P") pb.goTo(pb.index - 1, 0);
    else if (e.key === "m" || e.key === "M") pb.setMuted(!pb.muted);
    else if (e.key === "c" || e.key === "C") setCaptions(!captions);
  };

  const kind = lesson.meta.sourceKind;
  const ctx = useMemo(() => ({ item: (id: string | undefined) => (id ? byId.get(id) : undefined), openSource, selectedId, loc: (n: number) => locLabel(kind, n) }), [byId, openSource, selectedId, kind]);

  const canRegenerate = Boolean(onRegenerate) && REGENERABLE.includes(scene.type);
  const regenerate = async () => {
    if (!onRegenerate || regen?.id === scene.id) return;
    pb.pause();
    setRegen({ id: scene.id });
    const error = await onRegenerate(scene.id);
    setRegen(error ? { id: "", error } : null);
    if (!error) pb.goTo(pb.index, 0, false);
  };
  const voiceLabel = pb.voice === "recorded" ? "Recorded narration" : pb.voice === "browser" ? "Browser voice" : "No voice available: captions only";

  return (
    <LessonContext.Provider value={ctx}>
      <div className="lesson" data-reduced={reduced ? "true" : "false"}>
        <header className="lesson__head">
          <Link href="/" className="back">
            ← Start
          </Link>
          <div className="lesson__title">
            <h1>{lesson.meta.title}</h1>
            <p>
              {lesson.meta.authors}
              {lesson.meta.venue ? ` · ${lesson.meta.venue}` : ""}
              {lesson.meta.year ? ` (${lesson.meta.year})` : ""}
              {lesson.meta.license ? ` · ${lesson.meta.license}` : ""}
            </p>
          </div>
          <VerificationBadge lesson={lesson} coverage={coverage} />
        </header>
        {notice}

        <div className="lesson__grid">
          <div className="lesson__main">
            <section className="player" ref={playerRef} onKeyDown={onKey} aria-label="Lesson player">
              <nav className="chapters" aria-label="Chapters">
                <button type="button" className={`chapters__btn ${inIntro ? "is-active" : ""}`} aria-current={inIntro ? "true" : undefined} onClick={() => goChapter(-1)}>
                  <span className="chapters__num">Intro</span>
                  <span className="chapters__name">{formatTime(introTotal)}</span>
                </button>
                {lesson.chapters.map((c, k) => (
                  <button key={c.id} type="button" className={`chapters__btn ${entry.chapterIndex === k ? "is-active" : ""}`} aria-current={entry.chapterIndex === k ? "true" : undefined} onClick={() => goChapter(k)} data-chapter={c.id}>
                    <span className="chapters__num">{k + 1}</span>
                    <span className="chapters__name">{c.title}</span>
                  </button>
                ))}
              </nav>

              <div className="stage" tabIndex={0} role="group" aria-label={`Scene: ${scene.title}. ${scene.question}`} data-scene-type={scene.type} data-paused-for-source={held ? "true" : undefined} onClick={(e) => (e.target as HTMLElement).closest("button, a") || pb.toggle()}>
                <SceneView key={scene.id} scene={scene} state={sceneState} reduced={reduced} />
                {scene.type !== "establishing" && <Mascot pose={sceneState.mascot.pose} target={sceneState.mascot.target} sceneKey={`${scene.id}:${lesson.id}`} />}
                {held && (
                  <div className="heldbar" role="status">
                    <span>Paused to show the source</span>
                    <button type="button" className="btn btn--primary btn--small" onClick={resumeFromSource} data-action="continue">
                      <span aria-hidden="true">▶</span> Continue
                    </button>
                  </div>
                )}
                {showStart && (
                  <div className="overlay">
                    <button type="button" className="bigplay" onClick={pb.play} autoFocus>
                      <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
                        <path d="M7 4.5v15l13-7.500z" fill="currentColor" />
                      </svg>
                      <span>
                        <strong>Play the intro</strong>
                        <small>{formatTime(introTotal)} · question, key finding, caveat</small>
                      </span>
                    </button>
                  </div>
                )}
                {showEndCard && (
                  <div className="overlay overlay--end">
                    <p>That was the intro.</p>
                    <button type="button" className="btn btn--primary btn--large" onClick={watchFull} data-action="watch-full">
                      Watch the full paper →
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => goChapter(-1)}>
                      Replay the intro
                    </button>
                  </div>
                )}
              </div>

              <div className={`captions ${captions ? "" : "captions--off"}`} aria-live="off">
                {captions ? <p>{cue?.text ?? (pb.started ? " " : "Captions are on. Press play to start.")}</p> : null}
              </div>

              <div className="sources-line">
                <span className="sources-line__label">Sources for this sentence</span>
                {cue && cue.refs.length > 0 ? (
                  cue.refs.map((r) => {
                    const it = byId.get(r);
                    if (!it) return null;
                    return (
                      <button key={r} type="button" className={`source-tag ${selectedId === r ? "is-selected" : ""}`} onClick={() => openSource(r)} title={it.title}>
                        {it.title} · {locLabel(kind, it.source.page)}
                      </button>
                    );
                  })
                ) : (
                  <span className="sources-line__none">{cue?.connective ? "Transition, no scientific claim" : "—"}</span>
                )}
              </div>

              <div className="controls" role="group" aria-label="Playback controls">
                <button type="button" className="ctl ctl--play" onClick={pb.toggle} aria-label={pb.playing ? "Pause" : "Play"} data-action="play">
                  {pb.playing ? (
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                      <path d="M7 5h3.500v14H7zM13.500 5H17v14h-3.500z" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                      <path d="M7 4.5v15l13-7.500z" fill="currentColor" />
                    </svg>
                  )}
                </button>
                <button type="button" className="ctl" onClick={() => pb.goTo(pb.index - 1, 0)} disabled={pb.index === 0} aria-label="Previous scene">
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path d="M6 5v14M19 5.500v13L9 12z" fill="currentColor" stroke="currentColor" strokeWidth="1.500" strokeLinejoin="round" />
                  </svg>
                </button>
                <button type="button" className="ctl" onClick={() => pb.goTo(pb.index + 1, 0)} disabled={pb.index === playlist.length - 1} aria-label="Next scene">
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path d="M18 5v14M5 5.500v13L15 12z" fill="currentColor" stroke="currentColor" strokeWidth="1.500" strokeLinejoin="round" />
                  </svg>
                </button>
                <label className="seek">
                  <span className="sr-only">Position in this scene</span>
                  <input type="range" min={0} max={Math.max(duration, 0.1)} step={0.1} value={Math.min(pb.t, duration)} onChange={(e) => pb.seek(Number(e.target.value))} aria-valuetext={`${formatTime(pb.t)} of ${formatTime(duration)}`} />
                </label>
                <span className="time" aria-label={`Chapter time ${formatTime(chapterElapsed)} of ${formatTime(chapterTotal)}`}>
                  {formatTime(chapterElapsed)} / {formatTime(chapterTotal)}
                </span>
                <label className="ctl-select">
                  <span>Pace</span>
                  <select value={pb.rate} onChange={(e) => pb.setRate(Number(e.target.value))} aria-label="Playback pace">
                    {RATES.map((r) => (
                      <option key={r} value={r}>
                        {r}×
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="ctl ctl--toggle" aria-pressed={pb.muted} onClick={() => pb.setMuted(!pb.muted)} data-action="mute">
                  Mute
                </button>
                <button type="button" className="ctl ctl--toggle" aria-pressed={captions} onClick={() => setCaptions(!captions)} data-action="captions">
                  Captions
                </button>
                <button type="button" className="ctl ctl--toggle" aria-pressed={reduced} onClick={() => setMotionPref(!reduced)} data-action="reduced-motion" title={systemReduced ? "Your system asks for reduced motion" : undefined}>
                  Less motion
                </button>
              </div>

              <div className="scenebar">
                <ol className="scenebar__list" aria-label={inIntro ? "Scenes of the intro" : `Scenes of chapter ${entry.chapterIndex + 1}`}>
                  {chapterScenes.map((e) => (
                    <li key={e.scene.id}>
                      <button type="button" className={e.i === pb.index ? "is-active" : e.i < pb.index ? "is-done" : ""} aria-current={e.i === pb.index ? "step" : undefined} onClick={() => pb.goTo(e.i, 0, true)}>
                        {e.scene.title}
                      </button>
                    </li>
                  ))}
                </ol>
                <span className={`voice voice--${pb.voice}`}>{voiceLabel}</span>
              </div>
              {(scene.check?.status === "flagged" || canRegenerate || regen?.error) && (
                <div className={`scenecheck ${scene.check?.status === "flagged" ? "scenecheck--flagged" : ""}`} data-scene-check={scene.check?.status ?? "none"}>
                  {scene.check?.status === "flagged" && (
                    <div>
                      <strong>This scene did not pass the automatic check.</strong>
                      <ul>
                        {scene.check.problems.slice(0, 4).map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {scene.check?.status === "repaired" && <span className="scenecheck__note">This scene was regenerated after a failed check.</span>}
                  {regen?.error && <span className="scenecheck__note scenecheck__note--bad">{regen.error}</span>}
                  {canRegenerate && (
                    <button type="button" className="btn btn--ghost btn--small" onClick={regenerate} disabled={regen?.id === scene.id} data-action="regenerate-scene">
                      {regen?.id === scene.id ? "Regenerating this scene…" : "Regenerate this scene"}
                    </button>
                  )}
                </div>
              )}
              {playerExtras}
              {!inIntro || introDone ? null : (
                <button type="button" className="btn btn--ghost watchfull" onClick={watchFull}>
                  Skip to the full paper →
                </button>
              )}
              <p className="keys">
                Keyboard: <kbd>Space</kbd> play/pause · <kbd>←</kbd> <kbd>→</kbd> 5 s · <kbd>N</kbd> <kbd>P</kbd> scene · <kbd>M</kbd> sound · <kbd>C</kbd> captions
              </p>
            </section>

            <CoverageMap lesson={lesson} coverage={coverage} onSelect={openSource} />
            <DetailSections lesson={lesson} coverage={coverage} open={openSection} onOpen={setOpenSection} onSource={openSource} onJump={jumpToScene} />
          </div>

          <aside className={`lesson__side ${panelOpen ? "is-open" : ""}`} ref={panelRef}>
            <button type="button" className="side-toggle" aria-expanded={panelOpen} aria-controls="source-panel" onClick={() => setPanelOpen(!panelOpen)}>
              <span>Sources: original {kind === "text" ? "text" : "PDF"} and index</span>
              <span aria-hidden="true">{panelOpen ? "▲" : "▼"}</span>
            </button>
            <div id="source-panel" className="side-body">
              <SourcePanel
                lesson={lesson}
                coverage={coverage}
                selectedId={selectedId}
                tab={tab}
                onTab={setTab}
                onSelect={(id) => {
                  setSelectedId(id);
                  setTab("source");
                }}
                onJump={jumpToScene}
                onOpenDetail={openDetail}
                onResume={held ? resumeFromSource : undefined}
              />
            </div>
          </aside>
        </div>
      </div>
    </LessonContext.Provider>
  );
}
