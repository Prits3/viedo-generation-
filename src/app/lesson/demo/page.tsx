import type { Metadata } from "next";
import { LessonExperience } from "@/components/LessonExperience";
import { demoLesson } from "@/data/demo/lesson";

export const metadata: Metadata = { title: "Urban trees and heat in European cities | LearnLayla" };

export default function DemoLessonPage() {
  return <LessonExperience lesson={demoLesson} />;
}
