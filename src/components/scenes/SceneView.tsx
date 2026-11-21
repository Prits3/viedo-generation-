"use client";

// Reusable scene types. Each scene is a pure function of (scene data, current sentence):
// the element the voice talks about is revealed and emphasised, everything else recedes.
// Seeking therefore always shows a consistent picture, and reduced motion only removes transitions.
import type { CSSProperties } from "react";
import type { Scene } from "@/lib/types";
import { SourceTag, useLesson } from "../LessonContext";
import { Icon } from "./Icons";

interface SceneProps {
  scene: Scene;
  /** Index of the sentence being spoken (-1 before the first). */
  step: number;
  reduced: boolean;
}

interface Derived {
  focus?: string;
  revealed: (key: string) => boolean;
  state: (key: string) => string;
}

function derive(scene: Scene, step: number): Derived {
  const focus = step >= 0 ? scene.cues[step]?.focus : undefined;
  const seen = new Set<string>();
  for (let k = 0; k <= step && k < scene.cues.length; k++) {
    const f = scene.cues[k].focus;
    if (f) seen.add(f);
  }
  const everFocused = new Set(scene.cues.map((c) => c.focus).filter(Boolean) as string[]);
  // Elements no sentence points at are part of the base picture and always visible.
  const revealed = (key: string) => !everFocused.has(key) || seen.has(key);
  const state = (key: string) => `${revealed(key) ? "is-on" : "is-off"} ${focus === key ? "is-focus" : focus ? "is-dim" : ""}`;
  return { focus, revealed, state };
}

export function SceneView({ scene, step, reduced }: SceneProps) {
  const d = derive(scene, step);
  return (
    <div className={`scene scene--${scene.type}`} data-scene={scene.id} data-step={step}>
      {scene.type !== "question" && scene.type !== "establishing" && scene.type !== "figure" && (
        <header className="scene__head">
          <span className="scene__kicker">{scene.title}</span>
          <h3 className="scene__question">{scene.question}</h3>
        </header>
      )}
      <div className="scene__body">
        {scene.type === "establishing" && <Establishing scene={scene} d={d} reduced={reduced} />}
        {scene.type === "question" && <Question scene={scene} step={step} />}
        {scene.type === "comparison" && <Comparison scene={scene} d={d} />}
        {scene.type === "flow" && <Flow scene={scene} d={d} />}
        {scene.type === "map" && <RegionMap scene={scene} d={d} />}
        {scene.type === "figure" && <Figure scene={scene} d={d} />}
        {scene.type === "points" && <Points scene={scene} d={d} />}
        {scene.type === "timeline" && <Timeline scene={scene} d={d} />}
      </div>
    </div>
  );
}

// ───────────────────────── establishing: street -> orbit ─────────────────────────
const TILE_COLS = 14;
const TILE_ROWS = 6;
function tileKind(c: number, r: number): "tree" | "hot" | "warm" {
  const park = (c >= 3 && c <= 5 && r >= 1 && r <= 3) || (c >= 9 && c <= 10 && r >= 3 && r <= 4) || (c === 12 && r === 1);
  if (park) return "tree";
  return (c * 7 + r * 13) % 5 === 0 ? "hot" : "warm";
}

function Establishing({ scene, d, reduced }: { scene: Scene; d: Derived; reduced: boolean }) {
  const phase = d.focus === "satellite" ? "satellite" : d.focus === "liftoff" ? "liftoff" : "street";
  const labels = scene.establishing?.labels ?? [];
  const sat = labels.find((l) => l.key === "satellite");
  const street = labels.find((l) => l.key === "street");
  const tiles = [];
  for (let r = 0; r < TILE_ROWS; r++)
    for (let c = 0; c < TILE_COLS; c++) {
      const kind = tileKind(c, r);
      tiles.push(<rect key={`${c}-${r}`} x={132 + c * 50} y={202 + r * 50} width="44" height="44" rx="6" className={`est-tile est-tile--${kind}`} />);
    }
  return (
    <div className={`est est--${phase} ${reduced ? "est--reduced" : ""}`}>
      <svg viewBox="0 0 960 540" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration: a hot city street with trees, then the same city seen from a satellite as a grid of warm and cool surfaces.">
        <defs>
          <linearGradient id="est-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a2f63" />
            <stop offset="0.55" stopColor="#b9506a" />
            <stop offset="1" stopColor="#f6a55b" />
          </linearGradient>
          <radialGradient id="est-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff1c9" />
            <stop offset="0.55" stopColor="#ffd27a" />
            <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g className="est-orbit">
          <rect width="960" height="540" fill="#070c18" />
          {[[80, 60], [220, 110], [400, 40], [610, 90], [860, 60], [900, 200], [50, 300], [700, 30], [320, 500], [840, 480]].map(([x, y], k) => (
            <circle key={k} cx={x} cy={y} r={k % 3 === 0 ? 1.8 : 1.1} fill="#cdd7f2" opacity="0.7" />
          ))}
          <rect x="112" y="186" width="736" height="328" rx="16" fill="#0f1830" stroke="#26345a" />
          {tiles}
          <g className="est-sat">
            <path d="M0 0 L-70 96 L70 96 Z" fill="#9cc9ff" opacity="0.13" transform="translate(0 44)" />
            <rect x="-13" y="20" width="26" height="22" rx="4" fill="#dfe7fb" />
            <rect x="-52" y="24" width="34" height="14" rx="2" fill="#5b7cc4" />
            <rect x="18" y="24" width="34" height="14" rx="2" fill="#5b7cc4" />
            <circle cx="0" cy="46" r="4" fill="#ffc857" />
          </g>
        </g>

        <g className="est-street">
          <rect width="960" height="540" fill="url(#est-sky)" />
          <circle className="est-sunhalo" cx="745" cy="130" r="120" fill="url(#est-sun)" />
          <circle cx="745" cy="130" r="46" fill="#ffe7a8" />
          <g fill="#4a3566" opacity="0.85">
            <rect x="30" y="250" width="70" height="200" />
            <rect x="110" y="205" width="56" height="245" />
            <rect x="420" y="225" width="86" height="225" />
            <rect x="520" y="265" width="60" height="185" />
            <rect x="820" y="235" width="110" height="215" />
          </g>
          <g fill="#231b3d">
            <rect x="0" y="300" width="120" height="160" />
            <rect x="330" y="255" width="110" height="205" />
            <rect x="455" y="310" width="150" height="150" />
            <rect x="620" y="240" width="120" height="220" />
            <rect x="755" y="300" width="205" height="160" />
          </g>
          <g fill="#ffd27a" opacity="0.55">
            {[[346, 275], [372, 275], [398, 275], [346, 310], [398, 310], [372, 345], [636, 262], [664, 262], [692, 262], [636, 298], [692, 298], [664, 334], [772, 322], [806, 322], [840, 322], [874, 322], [476, 330], [512, 330], [548, 330]].map(([x, y], k) => (
              <rect key={k} x={x} y={y} width="14" height="18" rx="2" />
            ))}
          </g>
          <rect x="0" y="452" width="960" height="88" fill="#17122b" />
          <path d="M0 496h960" stroke="#ffd27a" strokeOpacity="0.5" strokeWidth="4" strokeDasharray="38 30" />
          <g className="est-trees">
            {[150, 215, 275].map((x, k) => (
              <g key={x} transform={`translate(${x} 452)`}>
                <rect x="-5" y="-62" width="10" height="62" rx="3" fill="#3b2a2a" />
                <circle cx="0" cy={-92 - (k % 2) * 8} r="40" fill="#2f9e6e" />
                <circle cx="-22" cy="-70" r="26" fill="#278a5f" />
                <circle cx="22" cy="-72" r="27" fill="#3fbf85" />
              </g>
            ))}
            <ellipse cx="212" cy="456" rx="120" ry="9" fill="#0b0818" opacity="0.6" />
          </g>
          <g className="est-shimmer" fill="none" stroke="#fff1c9" strokeOpacity="0.35" strokeWidth="2.5" strokeLinecap="round">
            <path d="M400 440c14-16 28 16 42 0s28 16 42 0 28 16 42 0" />
            <path d="M560 424c14-16 28 16 42 0s28 16 42 0 28 16 42 0 28 16 42 0" />
            <path d="M660 446c14-16 28 16 42 0s28 16 42 0 28 16 42 0" />
          </g>
        </g>
      </svg>

      {street && <div className="est-label est-label--street">{street.text}</div>}
      {sat && (
        <div className="est-label est-label--sat">
          <span>{sat.text}</span>
          <SourceTag id={sat.ref} />
        </div>
      )}
      <div className="est-legend" aria-hidden={phase !== "satellite"}>
        <span><i className="sw sw--warm" /> built-up surface</span>
        <span><i className="sw sw--cool" /> tree cover</span>
      </div>
      <span className="disclaimer">{scene.establishing?.disclaimer}</span>
    </div>
  );
}

// ───────────────────────── question ─────────────────────────
function Question({ scene, step }: { scene: Scene; step: number }) {
  const words = (scene.headline ?? scene.question).split(" ");
  return (
    <div className={`qcard ${step >= 0 ? "is-on" : ""}`}>
      <span className="qcard__kicker">{scene.kicker ?? "The question"}</span>
      <h3 className="qcard__headline">
        {words.map((w, k) => (
          <span key={k} style={{ "--i": k } as CSSProperties}>
            {w}{" "}
          </span>
        ))}
      </h3>
      <SourceTag id={scene.cues[0]?.refs[0]} label="Source" />
    </div>
  );
}

// ───────────────────────── comparison on one shared scale ─────────────────────────
function Comparison({ scene, d }: { scene: Scene; d: Derived }) {
  const c = scene.comparison;
  const { openSource, item } = useLesson();
  if (!c) return null;
  const pos = (v: number) => ((v - c.min) / (c.max - c.min || 1)) * 100;
  return (
    <div className="cmp">
      <div className={`cmp__axis-title ${d.state("axis")}`}>
        {c.axisLabel} <span className="cmp__unit">({c.unit})</span>
      </div>
      <div className="cmp__rows" role="list">
        {c.rows.map((r) => {
          const it = item(r.ref);
          return (
            <div key={r.key} role="listitem" className={`cmp__row cmp__row--${r.tone} ${d.state(r.key)}`}>
              <div className="cmp__label">{r.label}</div>
              <div className="cmp__track">
                {c.ticks.map((tk) => (
                  <i key={tk} className="cmp__grid" style={{ left: `${pos(tk)}%` }} />
                ))}
                <div className="cmp__bar" style={{ left: `${pos(r.from)}%`, width: `${Math.max(pos(r.to) - pos(r.from), 0.8)}%` }} title={it ? `${r.label}: ${r.display}. ${it.quantity?.conditions ?? ""}` : r.display} />
              </div>
              <button type="button" className="cmp__value" onClick={() => openSource(r.ref)} aria-label={`${r.label}: ${r.display}. Show where this number comes from in the paper.`}>
                <strong>{r.display}</strong>
                <span className="cmp__src">source · p. {it?.source.page}</span>
              </button>
            </div>
          );
        })}
        <div className="cmp__ticks" aria-hidden="true">
          <div />
          <div className="cmp__tickrow">
            {c.ticks.map((tk) => (
              <span key={tk} style={{ left: `${pos(tk)}%` }}>
                {tk}
                {c.unit === "K" ? " K" : ""}
              </span>
            ))}
          </div>
          <div />
        </div>
      </div>
      {c.annotations?.map((a) => (
        <div key={a.key} className={`cmp__note ${d.state(a.key)}`}>
          <span className="cmp__notemark" aria-hidden="true">!</span>
          <span>{a.text}</span>
          <SourceTag id={a.ref} />
        </div>
      ))}
      <p className={`cmp__basis ${d.state("basis")}`}>
        <span>{c.basis}</span> <SourceTag id={c.basisRef} />
      </p>
      {c.derivedNote && <span className="disclaimer disclaimer--inline">{c.derivedNote}</span>}
    </div>
  );
}

// ───────────────────────── flow: steps of a process ─────────────────────────
function Flow({ scene, d }: { scene: Scene; d: Derived }) {
  const steps = scene.flow?.steps ?? [];
  return (
    <ol className="flow" style={{ "--n": steps.length } as CSSProperties}>
      {steps.map((s, k) => (
        <li key={s.key} className={`flow__step ${d.state(s.key)}`}>
          <span className="flow__num">{k + 1}</span>
          <span className="flow__icon"><Icon name={s.icon} size={30} /></span>
          <strong className="flow__title">{s.title}</strong>
          <span className="flow__detail">{s.detail}</span>
          {s.facts?.map((f) => (
            <span key={f.text} className="flow__fact">
              {f.text} <SourceTag id={f.ref} />
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}

// ───────────────────────── schematic region map ─────────────────────────
function RegionMap({ scene, d }: { scene: Scene; d: Derived }) {
  const m = scene.map;
  if (!m) return null;
  const st = (d.focus && m.states[d.focus]) || m.states.all || { regions: [], badge: "" };
  const arrow = st.arrow === "up" ? "▲" : st.arrow === "down" ? "▼" : "";
  return (
    <div className="rmap">
      <div className="rmap__badge" aria-live="off">{st.badge}</div>
      <div className="rmap__grid" role="img" aria-label={`Schematic map of European regions. ${st.badge}${st.regions.length ? ": " + st.regions.map((k) => m.regions.find((r) => r.key === k)?.label).join(", ") : ""}.`}>
        {m.regions.map((r) => {
          const g = m.groups.find((x) => x.key === r.group);
          const hit = st.regions.includes(r.key);
          return (
            <div key={r.key} className={`rmap__tile rmap__tile--${g?.tone ?? "neutral"} ${hit ? "is-hit" : st.regions.length ? "is-dim" : ""}`} style={{ gridColumn: `${r.col + 1} / span ${r.w}`, gridRow: `${r.row + 1} / span ${r.h}` }}>
              <span>{r.label}</span>
              {hit && arrow && <b className={`rmap__arrow rmap__arrow--${st.arrow}`}>{arrow} {st.arrow === "up" ? "stronger" : "weaker"}</b>}
            </div>
          );
        })}
      </div>
      <ul className="rmap__legend">
        {m.groups.map((g) => (
          <li key={g.key}>
            <i className={`sw sw--${g.tone}`} />
            <span><strong>{g.label}</strong>: {g.value}</span>
            <SourceTag id={g.ref} />
          </li>
        ))}
      </ul>
      <span className="disclaimer disclaimer--inline">{m.disclaimer}</span>
    </div>
  );
}

// ───────────────────────── annotated original figure ─────────────────────────
function Figure({ scene, d }: { scene: Scene; d: Derived }) {
  const f = scene.figure;
  const { openSource, item } = useLesson();
  if (!f) return null;
  const ratio = f.width / f.height;
  const focused = f.callouts.find((c) => c.key === d.focus);
  return (
    <figure className={`fig ${ratio > 1.5 ? "fig--wide" : "fig--tall"}`}>
      <header className="scene__head fig__head">
        <span className="scene__kicker">{scene.title}</span>
        <h3 className="scene__question">{scene.question}</h3>
      </header>
      <div className="fig__fit">
        <div className={`fig__frame ${focused ? "has-focus" : ""}`} style={{ aspectRatio: `${f.width} / ${f.height}`, width: `min(100cqw, calc(100cqh * ${ratio.toFixed(4)}))` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.src} alt={f.alt} width={f.width} height={f.height} />
          {f.callouts.map((c, k) => (
            <div key={c.key} className={`fig__callout ${d.state(c.key)}`} style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }} aria-hidden="true">
              <b>{k + 1}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="fig__side">
        <ol className="fig__list">
          {f.callouts.map((c, k) => {
            const it = item(c.ref);
            return (
              <li key={c.key} className={d.state(c.key)}>
                <button type="button" onClick={() => c.ref && openSource(c.ref)} disabled={!it} tabIndex={d.revealed(c.key) ? 0 : -1} aria-label={`${c.label}.${it ? ` Show source, page ${it.source.page}.` : ""}`}>
                  <b aria-hidden="true">{k + 1}</b>
                  <span>{c.label}</span>
                  {it && <small>source · p. {it.source.page}</small>}
                </button>
              </li>
            );
          })}
        </ol>
        <figcaption className="fig__caption">
          <span>{f.attribution}</span>
          <SourceTag id={f.figureRef} label="Original figure" />
        </figcaption>
      </div>
    </figure>
  );
}

// ───────────────────────── points / caveats ─────────────────────────
function Points({ scene, d }: { scene: Scene; d: Derived }) {
  const items = scene.points?.items ?? [];
  const { openSource, item } = useLesson();
  return (
    <ul className={`points points--${items.length}`}>
      {items.map((p) => {
        const it = item(p.ref);
        return (
          <li key={p.key} className={`points__item ${d.state(p.key)}`}>
            <button type="button" onClick={() => p.ref && openSource(p.ref)} disabled={!it} tabIndex={d.revealed(p.key) ? 0 : -1} aria-label={`${p.title}. ${p.body}.${it ? ` Show source, page ${it.source.page}.` : ""}`}>
              <span className="points__icon"><Icon name={p.icon} size={30} /></span>
              <strong>{p.title}</strong>
              <span className="points__body">{p.body}</span>
              {it && <span className="points__src">source · p. {it.source.page}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ───────────────────────── timeline: when the satellite looks ─────────────────────────
function Timeline({ scene, d }: { scene: Scene; d: Derived }) {
  const tl = scene.timeline;
  const { openSource } = useLesson();
  if (!tl) return null;
  const pos = (h: number) => ((h - tl.from) / (tl.to - tl.from)) * 100;
  const hours = [0, 6, 12, 18, 24].filter((h) => h >= tl.from && h <= tl.to);
  return (
    <div className="tline">
      <div className={`tline__days ${d.state("revisit")}`} aria-hidden="true">
        {Array.from({ length: 17 }, (_, k) => (
          <i key={k} className={k === 0 || k === 16 ? "is-pass" : ""} />
        ))}
        <span>16 days between two looks at the same place</span>
      </div>
      <div className="tline__day">
        <div className="tline__bar" role="img" aria-label="One day from midnight to midnight with the satellite overpass marked at about 10:15 in the morning.">
          {hours.map((h) => (
            <span key={h} className="tline__hour" style={{ left: `${pos(h)}%` }}>
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
          <button type="button" className={`tline__marker ${d.state("marker")}`} style={{ left: `${pos(tl.marker.at)}%` }} onClick={() => openSource(tl.marker.ref)} tabIndex={d.revealed("marker") ? 0 : -1}>
            <span className="tline__pin" aria-hidden="true" />
            <span className="tline__markerlabel">{tl.marker.label}</span>
          </button>
        </div>
      </div>
      <ul className="tline__facts">
        {tl.facts.map((f) => (
          <li key={f.key} className={d.state(f.key)}>
            <strong>{f.title}</strong>
            <span>{f.body}</span>
            <SourceTag id={f.ref} />
          </li>
        ))}
      </ul>
      <span className="disclaimer disclaimer--inline">{tl.disclaimer}</span>
    </div>
  );
}
