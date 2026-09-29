import type { Metadata } from "next";
import { LegalDocView } from "@/components/legal-doc";
import { TERMS } from "@/lib/legal/terms";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return <LegalDocView doc={TERMS} />;
}
