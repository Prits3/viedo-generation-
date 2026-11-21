"use client";

// Reusable scene types. Each scene is a pure function of (scene data, scene state at the current time):
// the element the voice talks about is revealed and emphasised, everything else recedes.
// Seeking therefore always shows a consistent picture, and reduced motion only removes transitions.
// Elements carry data-key so the mascot can turn towards the one an action names.
import type { CSSProperties } from "react";
import type { Scene } from "@/lib/types";
import type { SceneState } from "@/lib/actions";
import { SourceTag, useLesson } from "../LessonContext";
import { DuckFigure } from "../Duck";
import { Icon } from "./Icons";

interface SceneProps {
  scene: Scene;
  state: SceneState;
  reduced: boolean;
}

/** Scene types that keep a lane free for the mascot beside their content. */
export const LANE_TYPES: Scene["type"][] = ["comparison", "flow", "map", "figure", "points", "timeline", "milestones", "statement"];

export function SceneView({ scene, state, reduced }: SceneProps) {
  const d = state;
  return (
    <div className={`scene scene--${scene.type} ${LANE_TYPES.includes(scene.type) ? "scene--lane" : ""}`} data-scene={scene.id} data-step={d.step} data-shot={d.shot}>
      {scene.type !== "question" && scene.type !== "establishing" && scene.type !== "figure" && (
        <header className="scene__head">
          <span className="scene__kicker">{scene.title}</span>
          <h3 className="scene__question">{scene.question}</h3>
        </header>
      )}
      <div className="scene__body">
        {scene.type === "establishing" && <Establishing scene={scene} d={d} reduced={reduced} />}
        {scene.type === "question" && <Question scene={scene} step={d.step} />}
        {scene.type === "statement" && <Statement scene={scene} d={d} />}
        {scene.type === "comparison" && <Comparison scene={scene} d={d} />}
        {scene.type === "flow" && <Flow scene={scene} d={d} />}
        {scene.type === "milestones" && <Milestones scene={scene} d={d} />}
        {scene.type === "map" && <RegionMap scene={scene} d={d} />}
        {scene.type === "figure" && <Figure scene={scene} d={d} />}
        {scene.type === "points" && <Points scene={scene} d={d} />}
        {scene.type === "timeline" && <Timeline scene={scene} d={d} />}
      </div>
    </div>
  );
}

// ───────────────────────── establishing: street -> orbit -> what is measured ─────────────────────────
const TILE_COLS = 14;
const TILE_ROWS = 6;
function tileKind(c: number, r: number): "tree" | "hot" | "warm" {
  const park = (c >= 3 && c <= 5 && r >= 1 && r <= 3) || (c >= 9 && c <= 10 && r >= 3 && r <= 4) || (c === 12 && r === 1);
  if (park) return "tree";
  return (c * 7 + r * 13) % 5 === 0 ? "hot" : "warm";
}
// Front row of buildings: x, top, width. Their roofs are surfaces a satellite sees.
const ROOFS: [number, number, number][] = [
  [0, 300, 120],
  [330, 255, 110],
  [455, 310, 150],
  [620, 240, 120],
  [755, 300, 205],
];
const TREES = [150, 215, 275];

function Establishing({ scene, d, reduced }: { scene: Scene; d: SceneState; reduced: boolean }) {
  const phase = ["street", "liftoff", "orbit", "surface"].includes(d.shot) ? d.shot : "street";
  const labels = scene.establishing?.labels ?? [];
  const label = (key: string) => labels.find((l) => l.key === key);
  const sat = label("satellite");
  const street = label("street");
  const surface = label("surface");
  const air = label("air");
  const pose = d.mascot.pose;
  // On the street the duck looks up at the sky; when the surfaces light up it leans towards them.
  const aim = pose === "look" ? -52 : pose === "lean" ? 14 : pose === "wow" ? -20 : -6;
  const tiles = [];
  for (let r = 0; r < TILE_ROWS; r++)
    for (let c = 0; c < TILE_COLS; c++) {
      const kind = tileKind(c, r);
      tiles.push(<rect key={`${c}-${r}`} x={132 + c * 50} y={202 + r * 50} width="44" height="44" rx="6" className={`est-tile est-tile--${kind}`} />);
    }
  return (
    <div className={`est est--${phase} ${reduced ? "est--reduced" : ""}`} data-shot={phase}>
      <svg
        viewBox="0 0 960 540"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="Illustration: a robot duck on a hot city street looks up; the same city seen from a satellite as a grid of warm and cool surfaces; back on the street, only roofs, the road and treetops light up, the surfaces a satellite measures."
      >
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
            {ROOFS.map(([x, top, w]) => (
              <rect key={x} x={x} y={top} width={w} height={460 - top} />
            ))}
          </g>
          <g fill="#ffd27a" opacity="0.55">
            {[[346, 275], [372, 275], [398, 275], [346, 310], [398, 310], [372, 345], [636, 262], [664, 262], [692, 262], [636, 298], [692, 298], [664, 334], [772, 322], [806, 322], [840, 322], [874, 322], [476, 330], [512, 330], [548, 330]].map(([x, y], k) => (
              <rect key={k} x={x} y={y} width="14" height="18" rx="2" />
            ))}
          </g>
          <rect x="0" y="452" width="960" height="88" fill="#17122b" />
          <path d="M0 496h960" stroke="#ffd27a" strokeOpacity="0.5" strokeWidth="4" strokeDasharray="38 30" />
          <g className="est-trees">
            {TREES.map((x, k) => (
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
            <path d="M660 446c14-16 28 16 42 0s28 16 42 0 28 16 42 0" />
          </g>

          {/* What a satellite measures: only the surfaces it sees from above light up. */}
          <g className="est-surface">
            <rect width="960" height="540" fill="#0a101d" opacity="0.62" />
            <g className="est-rays" stroke="#cfe0ff" strokeOpacity="0.3" strokeWidth="2" strokeDasharray="5 9">
              <path d="M385 60V250M680 60V236M215 60V318M858 60V296" />
            </g>
            <g className="est-glow est-glow--warm">
              {ROOFS.map(([x, top, w]) => (
                <rect key={x} x={x} y={top - 4} width={w} height="9" rx="4" />
              ))}
              <rect x="0" y="448" width="960" height="10" rx="4" />
            </g>
            <g className="est-glow est-glow--cool" fill="none" strokeWidth="9" strokeLinecap="round">
              {TREES.map((x, k) => {
                const cy = 452 - 92 - (k % 2) * 8;
                return <path key={x} d={`M${x - 34} ${cy - 21} A40 40 0 0 1 ${x + 34} ${cy - 21}`} />;
              })}
            </g>
            <g className="est-tags" fontSize="19" fontWeight="700" fill="#fff">
              <text x="385" y="238" textAnchor="middle">roof</text>
              <text x="215" y="296" textAnchor="middle">treetop</text>
              <text x="800" y="440" textAnchor="middle">road</text>
            </g>
          </g>

          <g className="est-duck" transform="translate(548 319) scale(1.06)">
            <DuckFigure pose={pose} aim={aim} />
          </g>
        </g>
      </svg>

      {street && <div className="est-label est-label--street">{street.text}</div>}
      {sat && (
        <div className="est-label est-label--sat" data-key="satellite">
          <span>{sat.text}</span>
          <SourceTag id={sat.ref} />
        </div>
      )}
      {surface && (
        <div className="est-label est-label--surface" data-key="surface">
          <span>{surface.text}</span>
          <SourceTag id={surface.ref} />
        </div>
      )}
      {air && (
        <div className="est-label est-label--air" data-key="air">
          <span>{air.text}</span>
          <SourceTag id={air.ref} />
        </div>
      )}
      <div className="est-legend" aria-hidden={phase !== "orbit" && phase !== "surface"}>
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
      <h3 className="qcard__headline" data-key="headline">
        {words.map((w, k) => (
          <span key={k} style={{ "--i": k } as CSSProperties}>
            {w}{" "}
          </span>
        ))}
      </h3>
      <SourceTag id={scene.cues.find((c) => c.refs.length)?.refs[0]} label="Source" />
    </div>
  );
}

// ───────────────────────── statement: one idea, calm ─────────────────────────
function Statement({ scene, d }: { scene: Scene; d: SceneState }) {
  const s = scene.statement;
  if (!s) return null;
  return (
    <div className="stmt">
      <div className={`stmt__idea ${d.state("idea")}`} data-key="idea">
        <span className="stmt__icon"><Icon name={s.icon} size={34} /></span>
        <p>{s.text}</p>
        <SourceTag id={s.ref} label="Source" />
      </div>
      {s.analogy && (
        <div className={`stmt__analogy ${d.state("analogy")}`} data-key="analogy">
          <span className="stmt__tag">Analogy, not a finding</span>
          <p>{s.analogy}</p>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── comparison on one shared scale ─────────────────────────
function Comparison({ scene, d }: { scene: Scene; d: SceneState }) {
  const c = scene.comparison;
  const { openSource, item, loc } = useLesson();
  if (!c) return null;
  const pos = (v: number) => ((v - c.min) / (c.max - c.min || 1)) * 100;
  // A single value is drawn as a bar from zero (or from the axis start); a range as the span it covers.
  const zero = c.min <= 0 && c.max >= 0 ? 0 : c.min;
  const span = (r: { from: number; to: number }) => (r.from === r.to ? [Math.min(zero, r.to), Math.max(zero, r.to)] : [r.from, r.to]);
  return (
    <div className="cmp">
      <div className={`cmp__axis-title ${d.state("axis")}`} data-key="axis">
        {c.axisLabel} <span className="cmp__unit">({c.unit})</span>
      </div>
      <div className="cmp__rows" role="list">
        {c.rows.map((r) => {
          const it = item(r.ref);
          return (
            <div key={r.key} role="listitem" className={`cmp__row cmp__row--${r.tone} ${d.state(r.key)}`} data-key={r.key}>
              <div className="cmp__label">{r.label}</div>
              <div className="cmp__track">
                {c.ticks.map((tk) => (
                  <i key={tk} className="cmp__grid" style={{ left: `${pos(tk)}%` }} />
                ))}
                <div className="cmp__bar" style={{ left: `${pos(span(r)[0])}%`, width: `${Math.max(pos(span(r)[1]) - pos(span(r)[0]), 0.8)}%` }} title={it ? `${r.label}: ${r.display}. ${it.quantity?.conditions ?? ""}` : r.display} />
              </div>
              <button type="button" className="cmp__value" onClick={() => openSource(r.ref)} tabIndex={d.revealed(r.key) ? 0 : -1} aria-label={`${r.label}: ${r.display}. Show where this number comes from in the source.`} data-value={r.key}>
                <strong>{r.display}</strong>
                <span className="cmp__src">source · {loc(it?.source.page ?? 0)}</span>
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
        <div key={a.key} className={`cmp__note ${d.state(a.key)}`} data-key={a.key}>
          <span className="cmp__notemark" aria-hidden="true">!</span>
          <span>{a.text}</span>
          <SourceTag id={a.ref} />
        </div>
      ))}
      <p className={`cmp__basis ${d.state("basis")}`} data-key="basis">
        <span>{c.basis}</span> <SourceTag id={c.basisRef} />
      </p>
      {c.derivedNote && <span className="disclaimer disclaimer--inline">{c.derivedNote}</span>}
    </div>
  );
}

// ───────────────────────── flow: steps of a process ─────────────────────────
function Flow({ scene, d }: { scene: Scene; d: SceneState }) {
  const steps = scene.flow?.steps ?? [];
  return (
    <ol className="flow" style={{ "--n": steps.length } as CSSProperties}>
      {steps.map((s, k) => (
        <li key={s.key} className={`flow__step ${d.state(s.key)}`} data-key={s.key}>
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

// ───────────────────────── milestones: events in order on one line ─────────────────────────
function Milestones({ scene, d }: { scene: Scene; d: SceneState }) {
  const items = scene.milestones?.items ?? [];
  const { openSource, item, loc } = useLesson();
  return (
    <ol className="mstones" style={{ "--n": items.length } as CSSProperties}>
      {items.map((m, k) => {
        const it = item(m.ref);
        return (
          <li key={m.key} className={`mstones__item ${d.state(m.key)}`} data-key={m.key}>
            <span className="mstones__tag">{m.tag || k + 1}</span>
            <i className="mstones__dot" aria-hidden="true" />
            <button type="button" onClick={() => m.ref && openSource(m.ref)} disabled={!it} tabIndex={d.revealed(m.key) ? 0 : -1} aria-label={`${m.tag ? m.tag + ": " : ""}${m.title}. ${m.body}.${it ? ` Show source, ${loc(it.source.page)}.` : ""}`}>
              <strong>{m.title}</strong>
              <span className="mstones__body">{m.body}</span>
              {it && <span className="points__src">source · {loc(it.source.page)}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ───────────────────────── schematic region map ─────────────────────────
function RegionMap({ scene, d }: { scene: Scene; d: SceneState }) {
  const m = scene.map;
  if (!m) return null;
  const st = (d.focus && m.states[d.focus]) || m.states.all || { regions: [], badge: "" };
  const arrow = st.arrow === "up" ? "▲" : st.arrow === "down" ? "▼" : "";
  return (
    <div className="rmap">
      <div className="rmap__badge" aria-live="off">{st.badge}</div>
      <div className="rmap__grid" data-key={d.focus} role="img" aria-label={`Schematic map of European regions. ${st.badge}${st.regions.length ? ": " + st.regions.map((k) => m.regions.find((r) => r.key === k)?.label).join(", ") : ""}.`}>
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
function Figure({ scene, d }: { scene: Scene; d: SceneState }) {
  const f = scene.figure;
  const { openSource, item, loc } = useLesson();
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
          {f.callouts.filter((c) => c.w > 0 && c.h > 0).map((c, k) => (
            <div key={c.key} className={`fig__callout ${d.state(c.key)}`} data-key={c.key} style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }} aria-hidden="true">
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
              <li key={c.key} className={d.state(c.key)} data-key={c.w > 0 ? undefined : c.key}>
                <button type="button" onClick={() => c.ref && openSource(c.ref)} disabled={!it} tabIndex={d.revealed(c.key) ? 0 : -1} aria-label={`${c.label}.${it ? ` Show source, ${loc(it.source.page)}.` : ""}`}>
                  <b aria-hidden="true">{k + 1}</b>
                  <span>{c.label}</span>
                  {it && <small>source · {loc(it.source.page)}</small>}
                </button>
              </li>
            );
          })}
        </ol>
        <figcaption className="fig__caption">
          <span>{f.attribution}</span>
          <SourceTag id={f.figureRef} label={item(f.figureRef)?.type === "table" ? "Original table" : "Original figure"} />
        </figcaption>
      </div>
    </figure>
  );
}

// ───────────────────────── points / caveats ─────────────────────────
function Points({ scene, d }: { scene: Scene; d: SceneState }) {
  const items = scene.points?.items ?? [];
  const { openSource, item, loc } = useLesson();
  return (
    <ul className={`points points--${items.length}`}>
      {items.map((p) => {
        const it = item(p.ref);
        return (
          <li key={p.key} className={`points__item ${d.state(p.key)}`} data-key={p.key}>
            <button type="button" onClick={() => p.ref && openSource(p.ref)} disabled={!it} tabIndex={d.revealed(p.key) ? 0 : -1} aria-label={`${p.title}. ${p.body}.${it ? ` Show source, ${loc(it.source.page)}.` : ""}`}>
              <span className="points__icon"><Icon name={p.icon} size={30} /></span>
              <strong>{p.title}</strong>
              <span className="points__body">{p.body}</span>
              {it && <span className="points__src">source · {loc(it.source.page)}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ───────────────────────── timeline: when the satellite looks ─────────────────────────
function Timeline({ scene, d }: { scene: Scene; d: SceneState }) {
  const tl = scene.timeline;
  const { openSource } = useLesson();
  if (!tl) return null;
  const pos = (h: number) => ((h - tl.from) / (tl.to - tl.from)) * 100;
  const hours = [0, 6, 12, 18, 24].filter((h) => h >= tl.from && h <= tl.to);
  return (
    <div className="tline">
      <div className={`tline__days ${d.state("revisit")}`} data-key="revisit" aria-hidden="true">
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
          <button type="button" className={`tline__marker ${d.state("marker")}`} data-key="marker" style={{ left: `${pos(tl.marker.at)}%` }} onClick={() => openSource(tl.marker.ref)} tabIndex={d.revealed("marker") ? 0 : -1}>
            <span className="tline__pin" aria-hidden="true" />
            <span className="tline__markerlabel">{tl.marker.label}</span>
          </button>
        </div>
      </div>
      <ul className="tline__facts">
        {tl.facts.map((f) => (
          <li key={f.key} className={d.state(f.key)} data-key={f.key}>
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
