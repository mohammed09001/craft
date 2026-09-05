import styles from "@/design-system/primitives/skip-link/SkipLink.module.css";

type SkipLinkProps = {
  targetId: string;
  children: string;
};

export function SkipLink({ targetId, children }: SkipLinkProps) {
  return (
    <a className={styles.link} href={`#${targetId}`}>
      {children}
    </a>
  );
}
