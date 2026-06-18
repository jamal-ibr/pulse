export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-panel" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-panel" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl bg-panel" />
      <div className="h-48 animate-pulse rounded-xl bg-panel" />
    </div>
  );
}
