import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "@/design-system/primitives/icon-button/IconButton.module.css";

type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  label: string;
  children: ReactNode;
};

export function IconButton({
  className,
  label,
  type = "button",
  children,
  ...buttonProps
}: IconButtonProps) {
  const classNames = className === undefined ? styles.button : `${styles.button} ${className}`;

  return (
    <button
      {...buttonProps}
      aria-label={label}
      className={classNames}
      type={type}
    >
      {children}
    </button>
  );
}
