"use client";

import { type CSSProperties, useId } from "react";
import { BRAID_STRANDS } from "./braid-geometry";
import styles from "./mockup.module.css";

/** Onde os três fios entram na trança e o pé dela, na grade da marca (viewBox). */
const STRAND_TOP = 11.24;
const BRAID_BOTTOM = 93.3;
const STRAND_X = { nevoa: 66.96, destaque: 33.04, tinta: 50 } as const;
const WIDTH_PX = 36;
const KNOT_HEIGHT_PX = 74;
const VIEWBOX_WIDTH = 42;

/**
 * A marca do chat com IA: três fios descem, se trançam e o ponto aparece no pé
 * (`design system/menu de conversa com ia`). `tail` é o comprimento dos fios
 * soltos acima da trança: maior na tela inteira, onde a marca tem mais espaço.
 * Com movimento reduzido, a marca aparece pronta.
 */
export function BraidMark({ tail }: { tail: number }) {
  const maskId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const top = STRAND_TOP - tail + 4;
  const viewHeight = BRAID_BOTTOM - top;
  const height = (WIDTH_PX / VIEWBOX_WIDTH) * viewHeight;
  // Cada fio aparece e some de cima para baixo: um traço do tamanho do fio que
  // corre de antes do topo ate depois do pe.
  const markStyle = {
    height,
    // Os fios soltos sobem por cima do que estiver acima; o lugar da marca e so a trança.
    marginTop: KNOT_HEIGHT_PX - height,
    "--braid-dash": `${tail} ${tail + 2}`,
    "--braid-from": `${tail + 1}`,
    "--braid-to": `${-(tail + 1)}`,
  } as CSSProperties;

  return (
    <span className={styles.braidMark} style={markStyle} aria-hidden>
      <svg aria-hidden className={styles.braidTails} style={{ width: WIDTH_PX, height }} viewBox={`29 ${top} ${VIEWBOX_WIDTH} ${viewHeight}`}>
        {(["nevoa", "destaque", "tinta"] as const).map((tone) => (
          <line key={tone} x1={STRAND_X[tone]} y1={STRAND_TOP - tail} x2={STRAND_X[tone]} y2={STRAND_TOP} data-tone={tone} />
        ))}
      </svg>
      <svg aria-hidden className={styles.braidKnot} style={{ width: WIDTH_PX, height: KNOT_HEIGHT_PX }} viewBox={`29 7 ${VIEWBOX_WIDTH} 86.3`}>
        <defs>
          {BRAID_STRANDS.map((strand, index) => (
            <mask key={strand.tone} id={`${maskId}-${index}`} maskUnits="userSpaceOnUse" x="-150" y="-150" width="400" height="400">
              <rect x="-150" y="-150" width="400" height="400" fill="white" />
              {strand.cuts.map((cut) => (
                <path key={cut.path} d={cut.path} fill="none" stroke="black" strokeWidth="11.05" strokeLinecap={cut.round ? "round" : "butt"} strokeLinejoin="round" />
              ))}
            </mask>
          ))}
        </defs>
        {BRAID_STRANDS.map((strand, index) => (
          <g key={strand.tone} mask={`url(#${maskId}-${index})`}>
            <path d={strand.path} data-tone={strand.tone} fill="none" strokeWidth="5.81" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
      </svg>
      <span className={styles.braidDot} />
    </span>
  );
}
