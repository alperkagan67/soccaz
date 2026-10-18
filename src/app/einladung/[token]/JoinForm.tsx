"use client";

import { useActionState } from "react";
import { joinTeamAction } from "@/server/actions";
import { SubmitButton } from "@/components/FormBits";

export function JoinForm({ token }: { token: string }) {
  const [state, action] = useActionState(() => joinTeamAction(token), undefined);
  return (
    <form action={action} className="space-y-3">
      <SubmitButton>Team beitreten</SubmitButton>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}
