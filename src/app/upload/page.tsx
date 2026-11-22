import type { Metadata } from "next";
import { UploadFlow } from "./UploadFlow";

export const metadata: Metadata = { title: "Make a lesson | LearnLayla" };

export default function UploadPage() {
  return <UploadFlow />;
}
