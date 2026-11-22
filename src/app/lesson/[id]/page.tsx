import type { Metadata } from "next";
import { StoredLesson } from "./StoredLesson";

export const metadata: Metadata = { title: "Lesson | LearnLayla" };

export default async function StoredLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StoredLesson id={id} />;
}
