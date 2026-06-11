import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-lg font-bold">Page not found</h1>
      <p className="text-sm text-ink-dim">This page does not exist in Jamal OS.</p>
      <Link href="/" className={buttonClass}>
        Back to Daily Brief
      </Link>
    </div>
  );
}
