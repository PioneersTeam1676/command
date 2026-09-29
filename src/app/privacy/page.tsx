import type { Metadata } from "next";
import { LegalDocView } from "@/components/legal-doc";
import { PRIVACY } from "@/lib/legal/privacy";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return <LegalDocView doc={PRIVACY} />;
}
