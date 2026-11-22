"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DuckFigure } from "./Duck";

export function LaylaFlight() {
  const frame = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const [pastStage, setPastStage] = useState(false);

  useEffect(() => {
    if (!frame.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      const leaving = entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0) && entry.intersectionRatio <= .45;
      setOffscreen(!entry.isIntersecting || leaving);
      setPastStage(leaving);
    }, { threshold: [0, .45, .46] });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);

  return (
    <figure ref={frame} className="cinema-frame" data-flight-paused={paused} data-flight-offscreen={offscreen}>
      <div className="cinema-frame__art" aria-hidden="true" />
      <div className="layla-light" aria-hidden="true" />
      <span className="cinema-frame__tag"><span aria-hidden="true">✦</span> Layla’s flight deck</span>
      <button type="button" className="layla-motion" onClick={() => setPaused((value) => !value)}>
        {paused ? "Resume motion" : "Pause motion"}
      </button>

      <div className="layla-airspace" aria-hidden="true">
        <svg className="layla-route" viewBox="0 0 400 260" preserveAspectRatio="none">
          <path d="M55 168C9 69 175 17 286 49c92 27 120 104 28 155C238 248 83 230 55 168Z" />
        </svg>
        <div className="layla-pilot" data-flight-pilot>
          <div className="layla-wake"><i /><i /><i /></div>
          <svg className="layla-pilot__duck" viewBox="0 0 120 132" focusable="false"><DuckFigure pose="wow" aim={-10} /></svg>
        </div>
      </div>

      <Link href="/lesson/demo" className="cinema-play" data-action="try-example" aria-label="Play the example lesson: How do trees cool a city?">
        <span aria-hidden="true">▶</span> <span>Play example</span>
      </Link>
      {pastStage && (
        <div className="layla-dock" data-flight-dock aria-hidden="true">
          <span className="layla-dock__ring" />
          <svg viewBox="0 0 120 132" focusable="false"><DuckFigure pose="wow" aim={-8} /></svg>
        </div>
      )}
      <figcaption className="cinema-frame__caption">
        <strong>How do trees cool a city?</strong>
        <small>Urban heat in 293 European cities</small>
      </figcaption>
    </figure>
  );
}
