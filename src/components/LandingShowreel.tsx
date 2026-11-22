"use client";

import Link from "next/link";
import { useRef, useState } from "react";

const views = [
  { id: "paper", name: "Paper", title: "A paper worth unpacking", body: "Researchers compared how surface temperatures differ between trees and built-up areas in 293 European cities." },
  { id: "lesson", name: "Lesson", title: "Same question, two climates", body: "The demo contrasts central and southern Europe, then explains why the amount of cooling varies." },
  { id: "source", name: "Source", title: "The words behind the claim", body: "The authors link the lower cooling in southern cities to lower evapotranspiration rates." },
] as const;

export function LandingShowreel() {
  const [view, setView] = useState(0);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = views[view];

  return (
    <section className="showreel" aria-labelledby="showreel-title">
      <div className="showreel__intro">
        <h2 id="showreel-title">A lesson you can trace.</h2>
        <p>Follow one finding from the published study to the scene that explains it, then back to the original words.</p>
        <button ref={trigger} className="showreel__trailer" type="button" onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}><span aria-hidden="true">▶</span> Watch trailer <small>0:34</small></button>
      </div>

      <div className="showreel__workbench">
        <div className="showreel__steps" role="group" aria-label="Choose a walkthrough step">
          {views.map((step, i) => (
            <button key={step.id} type="button" aria-pressed={view === i} aria-controls="showreel-view" onClick={() => setView(i)}>
              <span aria-hidden="true">0{i + 1}</span>{step.name}
            </button>
          ))}
        </div>
        <div id="showreel-view" aria-live="polite">
          <div className="showreel__card" data-view={current.id} key={current.id}>
            <svg className="showreel__diagram" viewBox="0 0 170 134" aria-hidden="true" fill="none">
              {current.id === "lesson" ? <>
                <path d="M16 13v108h140" stroke="currentColor" strokeWidth="2" />
                <path className="showreel__bar" d="M26 62h37v51H26z" fill="currentColor" opacity=".38" />
                <path className="showreel__bar" d="M74 30h37v83H74z" fill="currentColor" opacity=".7" />
                <path className="showreel__bar" d="M122 48h26v65h-26z" fill="currentColor" />
              </> : <>
                <path d="M44 9h54l28 28v88H44z" stroke="currentColor" strokeWidth="2" />
                <path d="M98 9v28h28M59 54h49M59 68h49M59 82h42M59 96h31" stroke="currentColor" strokeWidth="2" />
                {current.id === "source" && <path className="showreel__scan" d="M55 76h64v12H55z" fill="currentColor" opacity=".34" />}
              </>}
            </svg>
            <span className="showreel__card-label">{current.id === "source" ? "Schwaab et al. · Page 6" : current.id === "paper" ? "Nature Communications · 2021" : "Example lesson"}</span>
            <h3>{current.title}</h3>
            <p>{current.body}</p>
            {current.id === "source" && <blockquote><mark>are related to low ET rates</mark></blockquote>}
            {current.id === "lesson" && <Link href="/lesson/demo">Open the example lesson <span aria-hidden="true">↗</span></Link>}
            {current.id === "source" && <a href="/demo/schwaab2021.pdf#page=6">Read page 6 in the original PDF <span aria-hidden="true">↗</span></a>}
          </div>
        </div>
      </div>

      <dialog className="showreel__dialog" ref={dialog} aria-labelledby="showreel-video-title" onClose={() => {
        setOpen(false);
        trigger.current?.focus();
      }}>
        <header><h3 id="showreel-video-title">LearnLayla · Hackathon trailer</h3><button type="button" autoFocus onClick={() => dialog.current?.close()}>Close</button></header>
        {open && <video controls playsInline preload="metadata" src="/learnlayla-trailer.mp4" aria-label="LearnLayla hackathon trailer with English captions" />}
        <p>English narration and captions · 34 seconds. Highlighted excerpt: <a href="/demo/schwaab2021.pdf#page=6">Schwaab et al. (2021), p. 6</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>).</p>
      </dialog>
    </section>
  );
}
