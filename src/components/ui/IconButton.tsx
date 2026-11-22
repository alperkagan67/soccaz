import type { ButtonHTMLAttributes, ReactNode } from "react";
import { iconButtonClasses, type ButtonVariant } from "./button-styles";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style" | "children" | "aria-label"> & {
  /** Pflicht: der Name für Screenreader (wird `aria-label`). Ein Symbol allein hat keinen Namen. */
  label: string;
  /** Das Symbol; für Screenreader ausgeblendet, der Name kommt aus `label`. */
  icon: ReactNode;
  variant?: ButtonVariant;
};

/** Knopf nur mit Symbol. Mindestens 44 × 44 px, sichtbarer Fokus. */
export function IconButton({ label, icon, variant = "secondary", type = "button", disabled, ...rest }: IconButtonProps) {
  return (
    <button {...rest} type={type} style={undefined} disabled={disabled} aria-label={label} aria-disabled={disabled || undefined} className={iconButtonClasses(variant, Boolean(disabled))}>
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
    </button>
  );
}
