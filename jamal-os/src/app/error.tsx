"use client";

import { buttonClass } from "@/components/ui";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-lg font-bold">Something went wrong</h1>
      <p className="max-w-md text-sm text-ink-dim">
        {error.message || "An unexpected error occurred. Your local data is safe."}
      </p>
      <button onClick={reset} className={buttonClass}>
        Try again
      </button>
    </div>
  );
}
