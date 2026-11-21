import type { Metadata } from "next";
import { UploadFlow } from "./UploadFlow";

export const metadata: Metadata = { title: "Make a lesson | PaperScenes" };

export default function UploadPage() {
  return <UploadFlow />;
}
