// Ícones vetoriais deste estudo, desenhados na mesma grade de 24 px.
import styles from "./mockup.module.css";

export function SearchCreateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="13.5" cy="10" r="7" />
      <path d="m8.5 15-6 6M13.5 6.8v6.4M10.3 10h6.4" />
    </svg>
  );
}

export function IntelligenceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden style={{ overflow: "visible" }}>
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
      {[0, 0.8, 1.6].map(delay => (
        <circle key={delay} className={styles.wave} cx="12" cy="12" r="5" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeDasharray="1.1 1.7" strokeLinecap="round" style={{ animationDelay: `${delay}s` }} />
      ))}
    </svg>
  );
}

export function SpacesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="4" cy="6" r=".8" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r=".8" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r=".8" fill="currentColor" stroke="none" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  );
}

export function BraidAssistantIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.8 16.8A9 9 0 1 1 7.2 20L2.8 21.2Z" />
      <path d="M8.5 10v4M12 8v8M15.5 10v4" />
    </svg>
  );
}

export function DiscoverIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="14" cy="10" r="7.1" />
      <path d="m8.9 15.1-6 6M14 5.7a4.3 4.3 0 0 1 4.3 4.3" />
    </svg>
  );
}
