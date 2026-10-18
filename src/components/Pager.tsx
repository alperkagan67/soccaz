import Link from "next/link";

/** Zurück/Weiter, behält die übrigen Suchparameter. */
export function Pager({ path, params, page, hasMore }: { path: string; params: Record<string, string | undefined>; page: number; hasMore: boolean }) {
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  if (page === 1 && !hasMore) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      {page > 1 ? <Link href={href(page - 1)} className="btn btn-ghost !min-h-9">Zurück</Link> : <span />}
      <span className="text-muted">Seite {page}</span>
      {hasMore ? <Link href={href(page + 1)} className="btn btn-ghost !min-h-9">Weiter</Link> : <span />}
    </div>
  );
}
