import type { Metadata } from "next";
import { ResourceVideoDemo } from "./ResourceVideoDemo";

export const metadata: Metadata = { title: "Resource to video | PaperScenes" };

export default function ResourceVideoPage() {
  return <ResourceVideoDemo />;
}
