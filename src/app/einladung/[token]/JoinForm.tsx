"use client";

import { joinTeamAction } from "@/server/actions";
import { SubmitButton } from "@/components/FormBits";
import { useFormAction } from "@/components/useFormAction";

export function JoinForm({ token }: { token: string }) {
  const { state, pending, onSubmit } = useFormAction(() => joinTeamAction(token));
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <SubmitButton pending={pending}>Team beitreten</SubmitButton>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}
