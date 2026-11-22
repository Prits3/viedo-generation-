"use client";
// "Ask Layla": pause the lesson, ask by voice or text, get an answer chosen from the source with the
// passage one click away, and continue at the same moment. Runs in the browser without a model.
//  - Clicking the microphone pauses picture and sound first; the browser asks for permission only then.
//  - The recognised text is shown for correction and sent with "Ask"; "Continue the lesson" resumes at once.
//  - Typed and spoken questions share one history, stored per lesson in this browser.
//  - Changing the chapter starts a fresh context (follow-ups no longer refer to the old answer).
import { useCallback, useEffect, useRef, useState } from "react";
import type { InventoryItem, Scene } from "@/lib/types";
import { answer, isResumeCommand, pageLabel, type Citation, type TutorKind } from "@/lib/tutor";

interface Msg {
  role: "you" | "layla" | "divider";
  text: string;
  kind?: TutorKind;
  citations?: Citation[];
  options?: string[];
  via?: "voice" | "text";
}

interface Props {
  lessonId: string;
  scene: Scene;
  cueIndex: number;
  chapterIndex: number;
  chapterTitle: string;
  inventory: InventoryItem[];
  sourceKind: "pdf" | "text";
  muted: boolean;
  pause: () => void;
  resume: () => void;
  openSource: (id: string) => void;
  /** Called when the viewer clears the local data of this lesson. */
  onClear?: () => void;
}

type Rec = { start: () => void; stop: () => void; abort: () => void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };

function recognitionCtor(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const key = (id: string) => `ll.tutor.${id}`;

export function Tutor({ lessonId, scene, cueIndex, chapterIndex, chapterTitle, inventory, sourceKind, muted, pause, resume, openSource, onClear }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [previous, setPrevious] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [canListen, setCanListen] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const recRef = useRef<Rec | null>(null);
  const viaRef = useRef<"voice" | "text">("text");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const loaded = useRef(false);
  const lastChapter = useRef(chapterIndex);

  // Restore the conversation of this lesson; detect what the browser can do.
  useEffect(() => {
    setCanListen(Boolean(recognitionCtor()));
    if ("speechSynthesis" in window) {
      const check = () => setCanSpeak(window.speechSynthesis.getVoices().length > 0);
      check();
      window.speechSynthesis.addEventListener?.("voiceschanged", check);
    }
    try {
      const raw = window.localStorage.getItem(key(lessonId));
      if (raw) {
        const saved = JSON.parse(raw) as { msgs?: Msg[]; previous?: string[] };
        if (Array.isArray(saved.msgs)) setMsgs(saved.msgs.slice(-40));
        if (Array.isArray(saved.previous)) setPrevious(saved.previous);
      }
    } catch {
      /* storage unavailable or damaged: start empty */
    }
    loaded.current = true;
  }, [lessonId]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      if (!msgs.length && !previous.length) window.localStorage.removeItem(key(lessonId));
      else window.localStorage.setItem(key(lessonId), JSON.stringify({ msgs: msgs.slice(-40), previous }));
    } catch {
      /* storage full or blocked: the conversation stays for this visit */
    }
  }, [msgs, previous, lessonId]);

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [msgs]);

  // A new chapter is a new context.
  useEffect(() => {
    if (lastChapter.current === chapterIndex) return;
    lastChapter.current = chapterIndex;
    setPrevious([]);
    setMsgs((m) => (m.length && m[m.length - 1].role !== "divider" ? [...m, { role: "divider", text: `New context: ${chapterTitle}` }] : m));
  }, [chapterIndex, chapterTitle]);

  const stopVoice = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (muted || !canSpeak) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[“”]/g, ""));
      u.lang = "en-US";
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    },
    [muted, canSpeak],
  );

  const continueLesson = useCallback(() => {
    recRef.current?.abort();
    setListening(false);
    stopVoice();
    resume();
  }, [resume, stopVoice]);

  const ask = useCallback(
    (question: string, via: "voice" | "text") => {
      const q = question.trim();
      if (!q) return;
      pause();
      stopVoice();
      const reply = answer(q, { scene, cueIndex, inventory, previous }, sourceKind);
      if (reply.kind === "resume") {
        setDraft("");
        setMsgs((m) => [...m, { role: "you", text: q, via }]);
        continueLesson();
        return;
      }
      setMsgs((m) => [...m, { role: "you", text: q, via }, { role: "layla", text: reply.text, kind: reply.kind, citations: reply.citations, options: reply.options }]);
      if (reply.citations.length) setPrevious(reply.citations.map((c) => c.id));
      setDraft("");
      viaRef.current = "text";
      setNote(null);
      speak(reply.text);
    },
    [pause, stopVoice, scene, cueIndex, inventory, previous, sourceKind, continueLesson, speak],
  );

  const listen = () => {
    // Stop picture and sound first, then ask the browser for the microphone.
    pause();
    stopVoice();
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return setNote("Voice input is not available in this browser. Type your question instead.");
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let text = "";
      for (let k = 0; k < e.results.length; k++) {
        text += e.results[k][0].transcript;
        if (e.results[k].isFinal) finalText = text;
      }
      setDraft(text);
      viaRef.current = "voice";
    };
    rec.onerror = (e) => {
      setNote(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone access was not allowed. You can type your question instead."
          : e.error === "no-speech"
            ? "I did not hear anything. Try again or type your question."
            : "Voice input stopped. You can type your question instead.",
      );
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      // The one spoken command that acts at once; everything else waits for "Ask" so it can be corrected.
      if (finalText && isResumeCommand(finalText)) {
        setDraft("");
        continueLesson();
        return;
      }
      if (!finalText) setNote((n) => n ?? "I did not catch a question. Try again or type it.");
      inputRef.current?.focus();
    };
    recRef.current = rec;
    setNote(null);
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      setNote("Voice input could not start. You can type your question instead.");
    }
  };

  useEffect(() => () => recRef.current?.abort(), []);

  const clear = () => {
    stopVoice();
    setMsgs([]);
    setPrevious([]);
    try {
      window.localStorage.removeItem(key(lessonId));
    } catch {
      /* nothing stored */
    }
    onClear?.();
  };

  return (
    <section className="tutor" aria-labelledby="tutor-title" data-tutor>
      <div className="tutor__head">
        <h2 id="tutor-title">Ask Layla about this moment</h2>
        <span className="tutor__badge" title="Answers are picked from passages of the source. No AI model writes them.">Answers from the source</span>
      </div>
      {msgs.length > 0 && (
        <ol className="tutor__log" ref={logRef} aria-live="polite">
          {msgs.map((m, k) =>
            m.role === "divider" ? (
              <li key={k} className="tutor__divider">{m.text}</li>
            ) : (
              <li key={k} className={`tutor__msg tutor__msg--${m.role}`} data-kind={m.kind}>
                <span className="tutor__who">{m.role === "you" ? (m.via === "voice" ? "You (voice)" : "You") : "Layla"}</span>
                <p>{m.text}</p>
                {m.citations && m.citations.length > 0 && (
                  <div className="tutor__cites">
                    {m.citations.map((c) => (
                      <button key={c.id} type="button" className="source-tag" onClick={() => openSource(c.id)} data-action="tutor-source" title={c.quote ?? c.title}>
                        {c.title} · {pageLabel(c, sourceKind)}
                      </button>
                    ))}
                  </div>
                )}
                {m.options && (
                  <div className="tutor__options">
                    {m.options.map((o) => (
                      <button key={o} type="button" className="btn btn--small btn--ghost" onClick={() => ask(o, "text")}>
                        {o.replace(/^Tell me more about: /, "")}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ),
          )}
        </ol>
      )}
      <form
        className="tutor__form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft, viaRef.current);
        }}
      >
        <button type="button" className={`tutor__mic ${listening ? "is-on" : ""}`} onClick={listen} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Ask by voice"} disabled={!canListen} title={canListen ? "Pauses the lesson, then listens" : "Voice input is not available in this browser"} data-action="tutor-mic">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
          </svg>
        </button>
        <label htmlFor="tutor-q" className="sr-only">Your question</label>
        <textarea
          id="tutor-q"
          ref={inputRef}
          rows={1}
          value={draft}
          placeholder={listening ? "Listening… speak now" : "Why is cooling lower in Southern Europe?"}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={pause}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(draft, viaRef.current);
            }
          }}
        />
        <button type="submit" className="btn btn--primary btn--small" disabled={!draft.trim()} data-action="tutor-ask">
          Ask
        </button>
      </form>
      {note && <p className="tutor__note" role="status">{note}</p>}
      <div className="tutor__actions">
        <button type="button" className="btn btn--small" onClick={continueLesson} data-action="tutor-resume">
          <span aria-hidden="true">▶</span> Resume lesson
        </button>
        {speaking && (
          <button type="button" className="btn btn--small btn--ghost" onClick={stopVoice} data-action="tutor-stop-voice">
            Stop voice
          </button>
        )}
        <button type="button" className="btn btn--small btn--ghost tutor__clear" onClick={clear} data-action="tutor-clear">
          Clear my data
        </button>
      </div>
      <p className="tutor__fine">
        Try “What is the evidence?”, “Explain that more simply” or say “Continue the lesson”. Answers are passages chosen from the source, not written by an AI. Voice input uses your browser&apos;s speech recognition, which may send audio to an external service (Chrome uses Google). Questions and your position are stored only in this browser.
      </p>
    </section>
  );
}
