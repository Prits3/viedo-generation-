import type { Metadata } from "next";
import Link from "next/link";
import { operator } from "@/lib/legal";

export const metadata: Metadata = { title: "Imprint | LearnLayla" };
export const dynamic = "force-dynamic";

export default function ImprintPage() {
  const op = operator();
  return (
    <main className="home legal">
      <Link href="/" className="back">← Start</Link>
      <h1>Imprint (Impressum)</h1>
      {op ? (
        <>
          <p>Information according to § 5 DDG:</p>
          <address>
            {op.name}
            {op.address.map((l) => (
              <span key={l}>
                <br />
                {l}
              </span>
            ))}
          </address>
          <p>
            Contact: <a href={`mailto:${op.email}`}>{op.email}</a>
          </p>
          <p>Responsible for the content: {op.name}, address as above.</p>
        </>
      ) : (
        <p data-legal="missing">The operator details for this deployment have not been set yet.</p>
      )}
      <p>
        <Link href="/privacy">Privacy notice</Link>
      </p>
    </main>
  );
}
