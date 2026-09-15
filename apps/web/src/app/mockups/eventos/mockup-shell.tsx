import Image from "next/image";
import type { ReactNode } from "react";
import { MobileNavigation } from "./mobile-navigation";
import styles from "./mockup.module.css";

export function BrandIcon() {
  return (
    <span className={styles.brandIcon}>
      <Image src="/mockups/braid/icon.png" alt="" width={80} height={80} priority />
    </span>
  );
}

export function MockupShell({
  children,
  fontClasses,
}: {
  children: ReactNode;
  fontClasses: string;
}) {
  return (
    <div className={`${styles.shell} ${fontClasses}`}>
      <a href="#conteudo" className={styles.skipLink}>Pular para o conteúdo</a>
      {children}
      <MobileNavigation />
    </div>
  );
}
