/**
 * A onda do Hermes: cinco barras, o glifo do botão de chat por voz. Vai dentro
 * do círculo verde-água (cabeçalho, barra inferior, linha de status do campo)
 * e, sozinha, é o botão que liga a transcrição.
 */
export function HermesGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="currentColor" stroke="none" aria-hidden>
      <rect x="3.4" y="12" width="3.2" height="8" rx="1.6" />
      <rect x="8.9" y="8" width="3.2" height="16" rx="1.6" />
      <rect x="14.4" y="4" width="3.2" height="24" rx="1.6" />
      <rect x="19.9" y="9" width="3.2" height="14" rx="1.6" />
      <rect x="25.4" y="12" width="3.2" height="8" rx="1.6" />
    </svg>
  );
}
