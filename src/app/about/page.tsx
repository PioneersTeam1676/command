import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = { title: "About" };

/** Public description of Command. The site itself opens on /login; point Google's OAuth "homepage" field here. */
export default function AboutPage() {
  return <Landing />;
}
