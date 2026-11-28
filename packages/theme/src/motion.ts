/**
 * Os tempos das animações de transição, para o web e para o app Android.
 *
 * Este arquivo é a fonte da verdade do movimento. `scripts/theme/generate-motion.ts`
 * escreve dele o `apps/web/src/styles/motion.css` (custom properties) e o
 * `Motion.kt` do app; os dois são gerados e um teste trava os três juntos.
 *
 * Há duas alavancas:
 *
 * - `MOTION_SCALE` multiplica o tempo de todas as transições dos dois lados:
 *   1 é o tempo dos canvases, 0.5 a metade, 2 o dobro. É o lugar para deixar
 *   tudo mais rápido ou mais lento de uma vez. Atrasos e escalonamentos andam
 *   junto, para a coreografia manter as proporções; no Android a rigidez das
 *   molas muda na proporção inversa do quadrado (`Motion.stiffness`).
 * - `motionDesign` guarda o tempo de desenho de cada transição que as duas
 *   plataformas compartilham (ou que o CSS e o código de um lado compartilham).
 *
 * O que só existe num lado escreve o tempo de desenho no lugar e o passa pela
 * mesma escala: no CSS `calc(300ms * var(--motion-scale))`, no TS
 * `motionMs(300)`, no Kotlin `Motion.ms(300)`. Laços (giro, pulso, piscar, os
 * pontos do pensando, o esqueleto) e o movimento reduzido ficam fora da escala.
 */
export const MOTION_SCALE = 0.25;

/** Os tempos de desenho, em milissegundos, antes da escala. */
export const motionDesign = {
  /** Troca curta de estado: cor, borda, opacidade. */
  durationFast: 150,
  /** Movimento de um elemento: deslocar, crescer, girar. */
  durationSlow: 240,
  /** Trocar de tela ou abrir uma folha. */
  durationScreen: 380,
  /** Voltar de uma tela ou fechar uma folha. */
  durationScreenBack: 280,
  /** A espera entre uma linha e a seguinte numa lista que chega. */
  stagger: 40,

  /** O voo do botão do Hermes até o status do campo, na ida e na volta. */
  flightOut: 210,
  flightBack: 360,
  /** O que pousa no fim do voo (o painel do chat, o campo do detalhe), e quanto espera. */
  flightLand: 137,
  flightLandDelay: 73,
  /** A barra inferior que se apaga ao entrar num detalhe e reaparece ao sair. */
  barAway: 126,
  barReturn: 216,
  barReturnDelay: 144,
  /** O painel do chat que se apaga na volta do voo. */
  panelAway: 234,
  /** O núcleo do botão do agente que sai e o X que entra no lugar dele. */
  coreAway: 200,
  closeEnter: 120,
  closeEnterDelay: 70,

  /** A folha de provedor, modelo e esforço: a folha, o véu, os blocos em fila, a estrela e o rádio. */
  sheetOpen: 480,
  sheetClose: 300,
  scrimOpen: 380,
  scrimClose: 220,
  sheetBlock: 380,
  sheetBlockDelay: 100,
  sheetBlockStep: 60,
  sheetToggle: 200,

  /** A gaveta de execução: crescer, recolher, as linhas que entram e saem e o cabeçalho. */
  drawerGrow: 420,
  drawerShrink: 300,
  drawerRowIn: 200,
  drawerRowOut: 120,
  drawerHeaderDelay: 100,

  /** O menu da seção: a linha escolhida acende antes de fechar; o corpo volta ao início depois da saída. */
  menuPickClose: 180,
  menuSettle: 360,

  /** O robô do Hermes: as trocas de pose e os gestos de concluir e de falhar. */
  botFade: 120,
  botPop: 460,
  botPopDelay: 170,
  botShake: 380,
  botShakeDelay: 80,
  botCheckDraw: 300,
  botCheckFade: 60,
  botCheckDelay: 110,
  botExDelay: 60,
  botPoint: 380,
  botPointDelay: 150,

  /** O fio que passa sob um valor que o Hermes acabou de mudar. */
  changeFlash: 1600,
} as const;

export type MotionToken = keyof typeof motionDesign;

/** Um tempo de desenho já na escala, arredondado para o milissegundo. */
export function motionMs(designMs: number, scale: number = MOTION_SCALE): number {
  return Math.round(designMs * scale);
}

/** Todos os tempos compartilhados, já na escala. */
export const motion: { readonly [K in MotionToken]: number } = Object.fromEntries(
  Object.entries(motionDesign).map(([name, ms]) => [name, motionMs(ms)]),
) as { [K in MotionToken]: number };
