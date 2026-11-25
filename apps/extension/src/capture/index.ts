import { capturePage, type CapturedPage } from "./page";

/**
 * O script que a extensão injeta na página. Ele só deixa a função pronta; quem
 * a chama é o service worker, numa segunda injeção, porque o valor devolvido
 * por um arquivo injetado depende de como o bundle termina.
 */
declare global {
  var __candeiaCapture: (() => CapturedPage) | undefined;
}

globalThis.__candeiaCapture = () => capturePage(document, location.href);
