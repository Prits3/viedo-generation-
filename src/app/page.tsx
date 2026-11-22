import Link from "next/link";
import { Library } from "@/components/Library";
import { EarlyAccess } from "@/components/EarlyAccess";
import { DuckFigure } from "@/components/Duck";
import { BRAND, REPO_URL } from "@/lib/brand";

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="home">
      <header className="home__top">
        <Link href="/" className="brand">
          <i aria-hidden="true" /> {BRAND}
        </Link>
        <a href={REPO_URL} className="btn btn--small btn--ghost" target="_blank" rel="noopener noreferrer" data-action="github">
          <GitHubMark /> Star on GitHub
        </a>
      </header>
      <section className="hero">
        <div className="hero__text">
          <h1>Watch the paper. Check every claim.</h1>
          <p className="lead">
            {BRAND} turns a paper, a document, a slide deck or a text into a one-minute short or a full narrated, visual lesson, guided by Layla, a small robot duck. You set the pace, the sound, the captions and the amount of motion.
            Every statement links straight to its passage in the original.
          </p>
        </div>
        <svg className="hero__duck" viewBox="0 0 120 132" role="presentation" focusable="false">
          <DuckFigure pose="wow" aim={-12} />
        </svg>
        <div className="hero__actions">
          <Link href="/lesson/demo" className="btn btn--primary" data-action="try-example">
            <strong>Try an example</strong>
            <small>Urban trees and heat in 293 European cities</small>
          </Link>
          <Link href="/upload" className="btn" data-action="upload">
            <strong>Drop in a file</strong>
            <small>PDF, Word, PowerPoint or text: a one-minute short or a full lesson</small>
          </Link>
        </div>
      </section>
      <ul className="features">
        <li>
          <strong>One minute first</strong>
          <span>An animated intro gives the question, one key finding and the caveat you need to read it correctly.</span>
        </li>
        <li>
          <strong>Your controls</strong>
          <span>Pace, sound, captions and a low-motion mode. Works with the keyboard and on a phone.</span>
        </li>
        <li>
          <strong>Source for every sentence</strong>
          <span>Click a number or figure to see the highlighted passage in the PDF, and jump back from the PDF to the scene.</span>
        </li>
        <li>
          <strong>Nothing gets lost</strong>
          <span>A content inventory shows where each result, figure, formula, footnote and reference lives.</span>
        </li>
      </ul>
      <Library heading="Shorts and lessons" />
      <EarlyAccess />
      <section className="repo" aria-labelledby="repo-title">
        <div>
          <h2 id="repo-title">Built in the open</h2>
          <p>The player, the generation pipeline and the source checks are on GitHub. Look inside, run it on your laptop, open an issue, or leave a star if you like it.</p>
        </div>
        <a href={REPO_URL} className="btn" target="_blank" rel="noopener noreferrer" data-action="github-repo">
          <GitHubMark /> View the code on GitHub
        </a>
      </section>
      <div className="example">
        <strong>Example paper</strong>
        <span>Schwaab et al. (2021). The role of urban trees in reducing land surface temperatures in European cities. Nature Communications 12:6763.</span>
        <small>Open access, CC BY 4.0. The example runs from checked local data: no model call, no API key.</small>
      </div>
      <footer className="home__foot">
        <Link href="/privacy">Privacy</Link>
        <Link href="/imprint">Imprint</Link>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
      </footer>
    </main>
  );
}
