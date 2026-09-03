import type { WorkoutCode } from "@repo/entities/contracts";

/**
 * Os rotulos dos codigos de treino, em portugues.
 *
 * O nome que fica gravado no evento vem do catalogo do backend — o cliente nao
 * o escolhe. Estes rotulos sao so o que o <select> mostra enquanto a pessoa
 * ainda esta escolhendo, e por isso vivem no frontend, junto do formulario.
 */
export const workoutCodeLabels: Record<WorkoutCode, string> = {
  treadmill: "Esteira",
  running: "Corrida",
  weightlifting: "Musculação",
  free: "Livre",
};
