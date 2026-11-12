import type { ReactNode } from "react";
import { Button } from "./Button";
import { LinkButton } from "./LinkButton";
import { PageTitle } from "./PageTitle";

/** Genau eine Hauptaktion: Link (`href`), Handler (`onClick`, nur aus einer Client-Komponente) oder Absenden eines Formulars (`form` = id). */
export type PageAction = { label: string } & ({ href: string } | { onClick: () => void } | { form: string });

export type PageHeaderProps = {
  /** Text der einzigen h1 der Seite. */
  title: string;
  /** „Dein Stand“: kurzer Block über der Aktion, z. B. „Du bist bereit, Karte hinterlegt“. */
  stand?: ReactNode;
  /** Die eine Hauptaktion der Seite (kein Array: mehr als eine ist nicht vorgesehen). */
  action?: PageAction;
  /** Zusatzangaben unter dem Titel (Datum, Halle …). */
  meta?: ReactNode;
};

function ActionButton({ action }: { action: PageAction }) {
  if ("href" in action) return <LinkButton variant="primary" href={action.href}>{action.label}</LinkButton>;
  if ("form" in action) return <Button variant="primary" type="submit" form={action.form}>{action.label}</Button>;
  return <Button variant="primary" onClick={action.onClick}>{action.label}</Button>;
}

/**
 * Seitenkopf: Titel (h1), Stand-Block, genau eine Hauptaktion.
 * Handy (unter 640 px): die Aktion steht als feste Leiste unten, über der BottomNav und der Safe-Area; ein Platzhalter
 * wird vom `PageShell` unten freigehalten (er erkennt `data-page-action`). Ab 640 px steht sie rechts im Kopf. Die Aktion wird nur einmal gerendert.
 */
export function PageHeader({ title, stand, action, meta }: PageHeaderProps) {
  return (
    <header className="space-y-3">
      <div className="sm:flex sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-1">
          <PageTitle>{title}</PageTitle>
          {meta ? <p className="text-sm text-muted">{meta}</p> : null}
        </div>
        {action ? (
          <>
            <div
              data-testid="page-action"
              data-page-action=""
              className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-bg px-4 py-3 sm:static sm:z-auto sm:shrink-0 sm:border-0 sm:bg-transparent sm:p-0 [&>*]:w-full sm:[&>*]:w-auto"
            >
              <ActionButton action={action} />
            </div>
          </>
        ) : null}
      </div>
      {stand ? (
        <section aria-label="Dein Stand" data-testid="page-stand" className="card text-sm">
          {stand}
        </section>
      ) : null}
    </header>
  );
}
