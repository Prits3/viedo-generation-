import type { Metadata } from "next";
import { UploadFlow } from "./UploadFlow";

export const metadata: Metadata = { title: "Upload a paper | PaperScenes" };

export default function UploadPage() {
  return <UploadFlow />;
}
