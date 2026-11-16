interface ExampleAnswer {
  type: string;
  routineName: string;
  foodInputText: string;
  sleepHours: number | null;
  sleepScore: number | null;
  workoutKind: string;
  workoutDurationMinutes: number | null;
  workoutCalories: number | null;
  workoutDistanceKm: number | null;
  startTimeOfDay: string;
  startOffsetMinutes: number | null;
  durationMinutes: number | null;
  endTimeOfDay: string;
  placeName: string;
}

/** Cada exemplo mostra o objeto inteiro: o schema exige todas as chaves em toda resposta. */
function example(frase: string, answer: Partial<ExampleAnswer>): string {
  return JSON.stringify({
    frase,
    resposta: {
      type: "common",
      routineName: "",
      foodInputText: "",
      sleepHours: null,
      sleepScore: null,
      workoutKind: "free",
      workoutDurationMinutes: null,
      workoutCalories: null,
      workoutDistanceKm: null,
      startTimeOfDay: "",
      startOffsetMinutes: null,
      durationMinutes: null,
      endTimeOfDay: "",
      placeName: "",
      ...answer,
    } satisfies ExampleAnswer,
  });
}

export class EventCommandPromptBuilderService {
  build(transcript: string): string {
    return [
      "Voce classifica uma frase falada por um usuario de um app de rotina e responde apenas com JSON valido.",
      "Escolha o tipo do evento entre 'common', 'food', 'training' e 'sleep' seguindo estas regras:",
      [
        "- 'sleep': a frase fala de dormir, acordar, soneca ou qualidade do sono.",
        "- 'food': a frase fala de comer ou beber alguma coisa especifica.",
        "- 'training': a frase fala de exercicio fisico, academia, corrida, esteira ou musculacao.",
        "- 'common': qualquer outra atividade do dia.",
      ].join("\n"),
      "'common' e o padrao. Na duvida entre 'common' e outro tipo, escolha 'common'.",
      "Preencha somente os campos do tipo escolhido. Use null nos campos numericos nao informados e string vazia nos campos de texto nao usados. Nunca invente numeros que a frase nao disse.",
      [
        "Significado dos campos:",
        "- routineName: nome curto em portugues para o evento de rotina, ate 40 caracteres.",
        "- foodInputText: apenas a parte da frase que descreve o que foi consumido, sem o verbo.",
        "- sleepHours: horas dormidas em formato decimal, por exemplo 7.5. Nunca em minutos.",
        "- sleepScore: qualidade do sono de 0 a 100.",
        "- workoutKind: 'walking' para caminhada, 'running' para corrida ao ar livre, 'treadmill' para esteira, 'weightlifting' para musculacao, 'free' para o resto.",
        "- workoutDurationMinutes: duracao do treino em minutos.",
        "- workoutCalories: calorias gastas no treino em kcal.",
        "- workoutDistanceKm: distancia percorrida em quilometros.",
        "- placeName: o lugar onde o evento acontece, so quando a frase diz o NOME de um estabelecimento ou um endereco ('clinica saude emocional', 'shopping del rey', 'rua da bahia 1148'). Copie como foi dito, sem 'na', 'no', 'ao'. String vazia para lugar generico ('a padaria', 'a academia', 'casa', 'o trabalho') ou quando a frase nao cita lugar.",
      ].join("\n"),
      [
        "Voce nao sabe que horas sao. Nunca escreva datas: descreva a janela do evento so com os campos abaixo.",
        "- startOffsetMinutes: quantos minutos ATRAS o evento comecou, sempre negativo. Use null quando o evento comeca agora.",
        "- startTimeOfDay: hora do relogio em que o evento comecou, no formato HH:MM de 24 horas. Use quando a frase disser a hora do inicio, por exemplo 'dormi as 23 horas'. String vazia quando nao souber.",
        "- durationMinutes: quanto o evento dura ou durou, em minutos. Use para 'por 6 horas', 'volto em 6 horas', 'durante 40 minutos'.",
        "- endTimeOfDay: hora do relogio em que o evento termina, no formato HH:MM de 24 horas. Use para 'ate as 6 da manha'. String vazia quando nao souber.",
        "Prefira durationMinutes quando a frase falar de quanto tempo, e endTimeOfDay quando ela falar de uma hora do relogio.",
        "Se a frase nao disser nada sobre o fim, deixe durationMinutes null e endTimeOfDay vazio: o evento fica em aberto.",
        "Em eventos de sono com duracao conhecida, preencha sleepHours e durationMinutes com o mesmo tempo.",
      ].join("\n"),
      "Exemplos:",
      example("comecei a estudar ingles", { type: "common", routineName: "Estudar ingles" }),
      example("almocei arroz, feijao e frango grelhado", {
        type: "food",
        foodInputText: "arroz, feijao e frango grelhado",
      }),
      example("dormi sete horas e meia, qualidade oitenta", {
        type: "sleep",
        sleepHours: 7.5,
        sleepScore: 80,
        durationMinutes: 450,
      }),
      example("vou dormir agora e volto em seis horas", {
        type: "sleep",
        sleepHours: 6,
        durationMinutes: 360,
      }),
      example("vou dormir agora, acordo as seis da manha", {
        type: "sleep",
        endTimeOfDay: "06:00",
      }),
      example("corri cinco quilometros em trinta minutos", {
        type: "training",
        workoutKind: "running",
        workoutDurationMinutes: 30,
        workoutDistanceKm: 5,
        durationMinutes: 30,
      }),
      example("comecei a trabalhar as nove e parei ao meio dia", {
        type: "common",
        routineName: "Trabalhar",
        startTimeOfDay: "09:00",
        endTimeOfDay: "12:00",
      }),
      example("acordei faz vinte minutos", {
        type: "common",
        routineName: "Acordar",
        startOffsetMinutes: -20,
      }),
      example("fui na padaria", { type: "common", routineName: "Ir na padaria" }),
      example("quero ir a clinica saude emocional", {
        type: "common",
        routineName: "Ir a clinica",
        placeName: "clinica saude emocional",
      }),
      `Frase do usuario: ${transcript}`,
    ].join("\n\n");
  }
}
