import type { Metadata } from "next";
import Link from "next/link";
import { operator } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy | LearnLayla" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const op = operator();
  return (
    <main className="home legal">
      <Link href="/" className="back">← Start</Link>
      <h1>Privacy notice</h1>
      <h2>Who is responsible</h2>
      {op ? (
        <p>
          {op.name}, {op.address.join(", ")}. Email: <a href={`mailto:${op.email}`}>{op.email}</a>
        </p>
      ) : (
        <p data-legal="missing">The operator details for this deployment have not been set yet; see the <Link href="/imprint">imprint</Link>.</p>
      )}

      <h2>What happens when you visit</h2>
      <p>
        The site is hosted by Vercel. When a page loads, Vercel processes your IP address and technical request data (time, page, browser) to deliver the
        page and keep the service secure. This site sets no tracking or advertising cookies and uses no analytics.
      </p>

      <h2>Early-access email</h2>
      <p>
        If you leave your email on the start page, it is stored with our database provider (Supabase) and used only to tell you when sign-in opens and about the launch. The legal
        basis is your consent (Art. 6(1)(a) GDPR). You can withdraw it at any time by writing to the contact above; the address is then deleted.
      </p>

      <h2>Asking the tutor and voice input</h2>
      <p>
        Typed questions are answered in your browser from passages of the source; they are not sent to us. If you use the microphone, your browser&apos;s speech
        recognition turns speech into text. Depending on the browser this can send the audio to the browser maker&apos;s service (Chrome uses Google). The
        browser asks for permission first; you can always type instead. Spoken answers use your browser&apos;s own voice.
      </p>

      <h2>Stored in your browser</h2>
      <p>
        Your position in a lesson, your questions and the tutor&apos;s answers, and player settings (pace, captions, motion) are kept in your browser&apos;s local
        storage so you can continue after a reload. They never leave your device. “Clear my data” in the player removes them for that lesson.
      </p>

      <h2>Your own documents</h2>
      <p>
        Where generating lessons is switched on, an uploaded document is sent to Amazon Bedrock (AWS) to write the lesson script; AWS states that model
        providers have no access to prompts and completions. On this public showcase generation is off unless stated on the upload page.
      </p>

      <h2>Your rights</h2>
      <p>
        You have the right to access, correction, deletion, restriction of processing, data portability and objection, and to lodge a complaint with a data
        protection supervisory authority.
      </p>
      <p>
        <Link href="/imprint">Imprint</Link>
      </p>
    </main>
  );
}
