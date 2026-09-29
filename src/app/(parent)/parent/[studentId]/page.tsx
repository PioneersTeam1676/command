import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { requireParent } from "@/lib/auth/current-user";
import { ParentScopeError, studentDisplay } from "@/lib/parent-scope";
import { z } from "zod";

export const metadata: Metadata = { title: "Student" };
export const dynamic = "force-dynamic";

export default async function ParentStudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const parent = await requireParent();
  const { studentId } = await params;
  if (!z.string().uuid().safeParse(studentId).success) notFound();
  let student;
  try {
    // The only way this page learns which student it may show: the scoped helper.
    student = await studentDisplay(parent.id, studentId);
  } catch (e) {
    if (e instanceof ParentScopeError) notFound();
    throw e;
  }
  return (
    <div className="space-y-6">
      <Link href="/parent" className="text-[13px] text-muted underline-offset-4 hover:underline">← All students</Link>
      <h1 className="text-[28px] font-semibold">{student.name}</h1>
      <EmptyState icon={<CalendarDays />} title="Calendar, hours and attendance are coming">
        Once the team starts using events and clock-in, you&apos;ll see {student.name.split(" ")[0]}&apos;s schedule, hours and attendance history here.
      </EmptyState>
    </div>
  );
}
