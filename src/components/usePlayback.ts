"use client";

// Playback clock for a playlist of scenes.
//  - Scenes with a recording: the <audio> element is the master clock (mute keeps it running).
//  - Scenes without: a timer clock; optionally the browser's speech synthesis reads each caption,
//    and the clock waits for it. If no voice is available, captions and visuals still play.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Scene } from "@/lib/types";
import { cueIndexAt } from "@/lib/actions";

export type VoiceKind = "recorded" | "browser" | "none";

export interface Playback {
  index: number;
  t: number;
  playing: boolean;
  started: boolean;
  rate: number;
  muted: boolean;
  voice: VoiceKind;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  goTo: (index: number, t?: number, autoplay?: boolean) => void;
  setRate: (r: number) => void;
  setMuted: (m: boolean) => void;
}

interface Options {
  /** Called when a scene finishes. Return false to stop instead of advancing. */
  onSceneEnd?: (index: number) => boolean;
  /** Allow speech synthesis for scenes without a recording. */
  browserVoice?: boolean;
}

export function usePlayback(scenes: Scene[], opts: Options = {}): Playback {
  const [index, setIndex] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [rate, setRateState] = useState(1);
  const [muted, setMutedState] = useState(false);
  const [audioFailed, setAudioFailed] = useState<Record<string, boolean>>({});
  const [ttsOk, setTtsOk] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // play() is rejected with AbortError when a newer scene starts loading before the old one began
  // to play (quick scene changes). That is not a reason to stop; only a real refusal is.
  const playRejected = useRef((e: unknown) => {
    if ((e as { name?: string } | null)?.name !== "AbortError") setPlaying(false);
  }).current;
  const s = useRef({ index, t, playing, rate, muted, scenes, opts, audioFailed, ttsOk });
  s.current = { index, t, playing, rate, muted, scenes, opts, audioFailed, ttsOk };
  const tts = useRef({ cue: -1, sceneId: "", speaking: false, started: false, askedAt: 0, holdSince: 0 });

  const scene = scenes[index];
  const useAudio = Boolean(scene?.audio) && !audioFailed[scene?.id ?? ""];
  const voice: VoiceKind = useAudio ? "recorded" : opts.browserVoice && ttsOk ? "browser" : "none";

  // Speech synthesis is only "available" when the browser actually lists voices.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const check = () => setTtsOk(window.speechSynthesis.getVoices().length > 0);
    check();
    window.speechSynthesis.addEventListener?.("voiceschanged", check);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", check);
  }, []);

  const stopSpeech = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    tts.current = { cue: -1, sceneId: "", speaking: false, started: false, askedAt: 0, holdSince: 0 };
  }, []);

  // One audio element for the whole session (more reliable on mobile than one per scene).
  useEffect(() => {
    const a = new Audio();
    a.preload = "auto";
    audioRef.current = a;
    const onError = () => {
      const cur = s.current.scenes[s.current.index];
      if (cur?.audio) setAudioFailed((f) => ({ ...f, [cur.id]: true }));
    };
    // A seek that arrives while a new recording is still loading would be lost; apply it once the
    // file knows its length, so the clock starts where the viewer asked.
    const onLoaded = () => {
      if (Math.abs(a.currentTime - s.current.t) > 0.3) {
        try {
          a.currentTime = s.current.t;
        } catch {
          /* ignore */
        }
      }
    };
    a.addEventListener("error", onError);
    a.addEventListener("loadedmetadata", onLoaded);
    return () => {
      a.pause();
      a.removeEventListener("error", onError);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeAttribute("src");
      audioRef.current = null;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  // Load the recording when the scene changes.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !scene) return;
    if (useAudio && scene.audio) {
      const abs = new URL(scene.audio, window.location.href).href;
      if (a.src !== abs) {
        a.src = scene.audio;
        a.load();
      }
      a.playbackRate = s.current.rate;
      a.muted = s.current.muted;
      try {
        a.currentTime = s.current.t;
      } catch {
        /* not seekable yet; the loop keeps state in sync */
      }
      if (s.current.playing) a.play().catch(playRejected);
    } else {
      a.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.id, scene?.audio, useAudio]);

  const finishScene = useCallback(() => {
    const cur = s.current;
    const goOn = cur.opts.onSceneEnd ? cur.opts.onSceneEnd(cur.index) : true;
    stopSpeech();
    if (goOn && cur.index < cur.scenes.length - 1) {
      setIndex(cur.index + 1);
      setT(0);
    } else {
      audioRef.current?.pause();
      setPlaying(false);
      setT(cur.scenes[cur.index]?.duration ?? 0);
    }
  }, [stopSpeech]);

  // Main loop.
  useEffect(() => {
    if (!playing || !scene) return;
    let raf = 0;
    let last = performance.now();
    const duration = scene.duration ?? 0;
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const cur = s.current;
      const a = audioRef.current;
      if (useAudio && a) {
        // While a recording is still loading (after a scene change) or seeking, its clock reads 0
        // or a stale value. Following it then would overwrite the time the viewer asked for.
        const ready = a.readyState >= 1 && !a.seeking && new URL(scene.audio ?? "", window.location.href).href === a.src;
        if (ready) {
          if (a.ended || a.currentTime >= duration - 0.03) return finishScene();
          if (Math.abs(a.currentTime - cur.t) > 1.5 && a.currentTime < 0.3 && cur.t > 0.3) {
            // The file just became ready at its start although a later time was requested.
            a.currentTime = cur.t;
          } else setT(a.currentTime);
        }
        if (a.paused && a.readyState >= 2) a.play().catch(playRejected);
      } else {
        let next = cur.t + dt * cur.rate;
        const speak = cur.opts.browserVoice && cur.ttsOk && !cur.muted && "speechSynthesis" in window;
        if (speak) {
          const k = cueIndexAt(scene, cur.t);
          const st = tts.current;
          if (k >= 0 && (st.cue !== k || st.sceneId !== scene.id)) {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(scene.cues[k].say ?? scene.cues[k].text);
            u.rate = cur.rate;
            u.lang = "en-US";
            const mine = { cue: k, sceneId: scene.id, speaking: true, started: false, askedAt: now, holdSince: 0 };
            tts.current = mine;
            u.onstart = () => {
              mine.started = true;
            };
            u.onend = u.onerror = () => {
              mine.speaking = false;
            };
            window.speechSynthesis.speak(u);
          }
          const cue = k >= 0 ? scene.cues[k] : undefined;
          const live = tts.current;
          if (cue && live.cue === k && live.speaking) {
            // Voice never started: give up on speech for this session, keep playing.
            if (!live.started && now - live.askedAt > 2500) {
              setTtsOk(false);
              stopSpeech();
            } else if (next >= (cue.end ?? 0)) {
              // Wait for the voice to finish the sentence (bounded).
              if (!live.holdSince) live.holdSince = now;
              if (now - live.holdSince < 9000) next = (cue.end ?? next) - 0.001;
            }
          }
        }
        if (next >= duration) return finishScene();
        setT(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, scene, useAudio, finishScene, stopSpeech]);

  const play = useCallback(() => {
    const cur = s.current;
    const sc = cur.scenes[cur.index];
    setStarted(true);
    // Restart the scene when play is pressed at its very end.
    if (sc && cur.t >= (sc.duration ?? 0) - 0.05) {
      setT(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
    }
    setPlaying(true);
    const a = audioRef.current;
    if (a && sc?.audio && !cur.audioFailed[sc.id]) a.play().catch(playRejected);
  }, []);

  const pause = useCallback(() => {
    setPlaying(false);
    audioRef.current?.pause();
    stopSpeech();
  }, [stopSpeech]);

  const toggle = useCallback(() => (s.current.playing ? pause() : play()), [pause, play]);

  const seek = useCallback(
    (to: number) => {
      const cur = s.current;
      const sc = cur.scenes[cur.index];
      const clamped = Math.max(0, Math.min(to, (sc?.duration ?? 0) - 0.05));
      setT(clamped);
      stopSpeech();
      const a = audioRef.current;
      if (a && sc?.audio && !cur.audioFailed[sc.id]) {
        try {
          a.currentTime = clamped;
        } catch {
          /* ignore */
        }
      }
    },
    [stopSpeech],
  );

  const goTo = useCallback(
    (i: number, at = 0, autoplay?: boolean) => {
      const cur = s.current;
      const target = Math.max(0, Math.min(i, cur.scenes.length - 1));
      stopSpeech();
      setStarted(true);
      setIndex(target);
      setT(at);
      const a = audioRef.current;
      const sc = cur.scenes[target];
      if (target === cur.index && a && sc?.audio && !cur.audioFailed[sc.id]) {
        try {
          a.currentTime = at;
        } catch {
          /* ignore */
        }
      }
      if (autoplay !== undefined) {
        setPlaying(autoplay);
        if (!autoplay) a?.pause();
        else if (target === cur.index && a && sc?.audio && !cur.audioFailed[sc.id]) a.play().catch(playRejected);
      }
    },
    [stopSpeech],
  );

  const setRate = useCallback(
    (r: number) => {
      setRateState(r);
      if (audioRef.current) audioRef.current.playbackRate = r;
      // Re-read the current sentence at the new speed.
      const cur = s.current;
      const sc = cur.scenes[cur.index];
      if (sc && !sc.audio) {
        const k = cueIndexAt(sc, cur.t);
        stopSpeech();
        if (k >= 0) setT(sc.cues[k].start ?? cur.t);
      }
    },
    [stopSpeech],
  );

  const setMuted = useCallback(
    (m: boolean) => {
      setMutedState(m);
      if (audioRef.current) audioRef.current.muted = m;
      if (m) stopSpeech();
    },
    [stopSpeech],
  );

  return { index, t, playing, started, rate, muted, voice, play, pause, toggle, seek, goTo, setRate, setMuted };
}
