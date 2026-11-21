import Link from "next/link";

export default function Home() {
  return (
    <main className="home">
      <Link href="/" className="brand">
        <i aria-hidden="true" /> PaperScenes
      </Link>
      <section className="hero">
        <h1>Watch the paper. Check every claim.</h1>
        <p className="lead">
          PaperScenes turns a research paper into a short narrated, visual lesson. You set the pace, the sound, the captions and the amount of motion. Every statement links straight to its
          passage in the original PDF.
        </p>
        <div className="hero__actions">
          <Link href="/lesson/demo" className="btn btn--primary" data-action="try-example">
            <strong>Try an example</strong>
            <small>Urban trees and heat in 293 European cities</small>
          </Link>
          <Link href="/upload" className="btn" data-action="upload">
            <strong>Upload a PDF</strong>
            <small>Generate a lesson from your own paper</small>
          </Link>
          <Link href="/resource-video" className="btn" data-action="resource-video">
            <strong>Resource to video</strong>
            <small>Add resources and generate a lesson video</small>
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
      <div className="example">
        <strong>Example paper</strong>
        <span>Schwaab et al. (2021). The role of urban trees in reducing land surface temperatures in European cities. Nature Communications 12:6763.</span>
        <small>Open access, CC BY 4.0. The example runs from checked local data: no model call, no API key.</small>
      </div>
    </main>
  );
}
