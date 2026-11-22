import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button-styles";

export type LinkButtonProps = Omit<ComponentProps<typeof Link>, "className" | "style" | "children" | "href"> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

/** Link im Aussehen eines Knopfs, für Navigation (nie für Aktionen; dafür `Button`). Mindestens 44 px hoch. */
export function LinkButton({ variant = "secondary", size = "md", href, children, ...rest }: LinkButtonProps) {
  return (
    <Link {...rest} href={href} style={undefined} className={buttonClasses(variant, size)}>
      {children}
    </Link>
  );
}
