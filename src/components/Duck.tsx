"use client";

// The guide character: a small robot duck, built from layers the browser animates one by one
// (body, wing, head, eye, eyelid, beak, antenna). A pose is only a data attribute; CSS moves the
// layers, so the same pose always looks the same after a seek, and reduced motion simply removes
// the transitions. The duck is decorative for assistive technology: everything it points at is
// also spoken, captioned and reachable by keyboard.
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { MascotPose } from "@/lib/types";

export type DuckPose = MascotPose | "away";

/** The figure itself, as SVG content (120 x 132 units, facing right). Can be placed inside any SVG. */
export function DuckFigure({ pose, aim = 0 }: { pose: DuckPose; aim?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <g className="dk" data-pose={pose} style={{ "--aim": `${aim}deg`, "--px": `${(Math.cos((aim * Math.PI) / 180) * 2.6).toFixed(2)}px`, "--py": `${(Math.sin((aim * Math.PI) / 180) * 2.6).toFixed(2)}px` } as CSSProperties}>
      <defs>
        <radialGradient id={`${uid}-eye`} cx="0.42" cy="0.38" r="0.7">
          <stop offset="0" stopColor="#b7fff4" />
          <stop offset="0.5" stopColor="#35e0d0" />
          <stop offset="1" stopColor="#0fa9b4" />
        </radialGradient>
        <clipPath id={`${uid}-lid`}>
          <circle cx="72" cy="42" r="13.5" />
        </clipPath>
      </defs>
      <ellipse className="dk-shadow" cx="58" cy="127.5" rx="30" ry="4.2" />
      <g className="dk-all">
        <g className="dk-feet">
          <rect x="46" y="112" width="4.5" height="11" rx="2" fill="#c98a2b" />
          <rect x="65" y="112" width="4.5" height="11" rx="2" fill="#c98a2b" />
          <ellipse cx="51" cy="124" rx="9.5" ry="4" fill="#f6a531" />
          <ellipse cx="70" cy="124.5" rx="9.5" ry="4" fill="#f6a531" />
        </g>
        <g className="dk-body">
          <path d="M31 84 L15 73 L27 100 Z" fill="#e6d9b8" />
          <ellipse cx="56" cy="91" rx="29" ry="25.5" fill="#f6eeda" />
          <ellipse cx="63" cy="97" rx="17" ry="14.5" fill="#a6e3cf" />
          <path d="M33 78 Q56 70 81 80" fill="none" stroke="#d9ccab" strokeWidth="1.6" strokeLinecap="round" />
          <g className="dk-wing">
            <path d="M59 78 q-8 12 -3 26 q10 3 14 -8 q2 -12 -11 -18z" fill="#5cc4a8" stroke="#379a82" strokeWidth="1.3" strokeLinejoin="round" />
            <circle cx="61" cy="83.5" r="2" fill="#2f8f78" />
          </g>
        </g>
        <rect x="52" y="62" width="15" height="10" rx="4" fill="#c5ced6" />
        <g className="dk-head">
          <g className="dk-antenna">
            <path d="M58 17 L54 6" stroke="#aab4bd" strokeWidth="3" strokeLinecap="round" />
            <circle className="dk-bulb" cx="53.500" cy="4.500" r="3.800" fill="#35e0d0" />
          </g>
          <rect x="34" y="15" width="58" height="53" rx="26" fill="#fbf5e6" />
          <path d="M37 36 a26 22 0 0 1 52 -2 q-26 -9 -52 2z" fill="#a6e3cf" />
          <circle cx="43.500" cy="47" r="5.500" fill="#c5ced6" stroke="#9aa6b0" strokeWidth="1.2" />
          <g className="dk-eye">
            <circle cx="72" cy="42" r="13.5" fill="#0f2b3d" />
            <circle className="dk-glow" cx="72" cy="42" r="10.6" fill={`url(#${uid}-eye)`} />
            <g className="dk-pupil">
              <circle cx="73.500" cy="42" r="4.300" fill="#0b3a48" />
              <circle cx="71.600" cy="39.800" r="1.700" fill="#ffffff" />
            </g>
            <g clipPath={`url(#${uid}-lid)`}>
              <rect className="dk-lid" x="58" y="28" width="28" height="28" fill="#fbf5e6" />
            </g>
          </g>
          <path d="M88 43 q15 -3 23 7 q-11 4 -24 2z" fill="#ffc83d" />
          <path className="dk-beak-low" d="M88 52 q10 3 20 -1 q-7 7 -20 6z" fill="#f2a52c" />
        </g>
        <g className="dk-spark" fill="#ffe58a">
          <path d="M101 14 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
          <path d="M112 30 l1.300 3.200 3.200 1.300 -3.200 1.300 -1.300 3.200 -1.300 -3.200 -3.200 -1.300 3.200 -1.300z" />
          <path d="M92 3 l1.200 3 3 1.200 -3 1.200 -1.200 3 -1.200 -3 -3 -1.200 3 -1.200z" />
        </g>
      </g>
    </g>
  );
}

/**
 * The duck beside a scene. It stands in a lane the scene layout keeps free, so it never covers
 * chart values, captions or source buttons. When an action names a target, the duck's head, eye
 * and wing turn towards that element's real position on screen.
 */
export function Mascot({ pose, target, sceneKey }: { pose: DuckPose; target?: string; sceneKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [aim, setAim] = useState({ angle: 0, flip: false });

  useLayoutEffect(() => {
    const el = ref.current;
    const stage = el?.closest<HTMLElement>(".stage");
    if (!el || !stage) return;
    const measure = () => {
      const d = el.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      const cx = d.left + d.width / 2;
      const cy = d.top + d.height * 0.34;
      // Without a target the duck faces the middle of the picture.
      const sideFlip = cx > s.left + s.width / 2;
      const hit = target ? stage.querySelector<HTMLElement>(`.scene [data-key="${CSS.escape(target)}"]`) : null;
      if (!hit) return setAim({ angle: pose === "enter" ? -10 : 0, flip: sideFlip });
      const r = hit.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx;
      const dy = r.top + r.height / 2 - cy;
      const angle = Math.max(-62, Math.min(48, (Math.atan2(dy, Math.max(Math.abs(dx), 1)) * 180) / Math.PI));
      setAim({ angle: Math.round(angle), flip: Math.abs(dx) < d.width * 0.4 ? sideFlip : dx < 0 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [pose, target, sceneKey]);

  return (
    <div ref={ref} className={`mascot ${aim.flip ? "mascot--flip" : ""}`} data-mascot-pose={pose} data-mascot-target={target ?? ""} aria-hidden="true">
      <svg viewBox="0 0 120 132" role="presentation" focusable="false">
        <DuckFigure pose={pose} aim={aim.angle} />
      </svg>
    </div>
  );
}
