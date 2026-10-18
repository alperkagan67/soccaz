"use client";

import { useState, useTransition } from "react";
import { moderateCommentAction } from "@/server/content-actions";

export function ModerationButtons({ commentId }: { commentId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = (decision: "restore" | "remove" | "remove_and_warn") => start(async () => setError((await moderateCommentAction(commentId, decision))?.error));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn btn-ghost !min-h-9 !px-3 text-xs" disabled={pending} onClick={() => run("restore")}>Wieder anzeigen</button>
      <button className="btn btn-danger !min-h-9 !px-3 text-xs" disabled={pending} onClick={() => run("remove")}>Entfernen</button>
      <button className="btn btn-danger !min-h-9 !px-3 text-xs" disabled={pending} onClick={() => run("remove_and_warn")}>Entfernen und verwarnen</button>
      {error && <span className="error text-xs" role="alert">{error}</span>}
    </div>
  );
}
