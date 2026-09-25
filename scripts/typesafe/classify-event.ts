/**
 * Script exploratório para testar a classificação de comandos com Jev (TypeSafe).
 * Não faz parte da aplicação — é só para rodar manualmente e ver como o Jev responde.
 *
 * Uma única consulta decide, a partir do comando em linguagem natural, entre:
 *   - criar/editar um evento de alimentação, comum, de sono ou de exercício
 *   - criar/editar mais de um evento na mesma mensagem
 *   - consultar (ver/listar/contar) dados já existentes
 *
 * Uso:
 *   TYPESAFE_API_KEY=... pnpm exec tsx scripts/typesafe/classify-event.ts
 */
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

const comandosDeTeste = [
  // criar/editar um evento de alimentação
  "cria um almoço às 12h",
  "marca um café da manhã amanhã às 8h",
  "adiciona um jantar hoje à noite, macarrão com frango",
  "muda o horário do meu lanche da tarde para 16h",
  "atualiza a descrição do almoço de ontem para 'sushi com a equipe'",
  "registra que comi uma pizza agora",

  // criar/editar um evento comum
  "marca uma reunião às 10h",
  "cria um compromisso no dentista amanhã às 14h",
  "agenda uma call com o cliente às 15h",
  "muda o local da reunião de hoje para a sala 3",
  "adiciona um evento de cinema no sábado à noite",
  "atualiza o nome do compromisso de terça para 'entrevista'",

  // criar/editar um evento de sono
  "registra que dormi das 23h às 7h",
  "cria uma soneca de 20 minutos depois do almoço",
  "marca que vou dormir cedo hoje, por volta das 22h",
  "atualiza a hora que acordei hoje para 6h30",
  "apaga o registro de sono de ontem",

  // criar/editar um evento de exercício
  "cria uma corrida de 30 minutos às 7h",
  "marca um treino de academia hoje à noite",
  "registra que fiz musculação por 1 hora",
  "atualiza a duração do treino de ontem para 45 minutos",
  "cancela a aula de natação de amanhã",

  // criar/editar mais de um evento (múltiplos)
  "cria um evento de corrida às 7h e um almoço às 12h",
  "atualiza a reunião de hoje e cria uma nova tarefa para amanhã",
  "marca um treino de manhã e um jantar à noite",
  "cria três eventos: café da manhã, reunião e corrida",
  "apaga a soneca de ontem e cria um treino para amanhã no lugar",

  // consultar vários dados
  "quantos eventos eu tenho essa semana?",
  "mostra meus treinos de amanhã",
  "quanto eu dormi essa semana em média?",
  "lista todas as refeições que registrei hoje",
  "quais compromissos eu tenho pendentes?",
  "me mostra um resumo do meu dia",
];

async function testarIntencaoDoComando(client: TypeSafeClient) {
  for (const comando of comandosDeTeste) {
    const resposta = await client.systemOne({
      state: { comando },
      questions: {
        intencao: choice(
          "O que o usuário está pedindo, com base neste comando em linguagem natural para um " +
            "app de agenda pessoal que registra eventos de alimentação, sono, exercício e eventos comuns?",
          {
            criar_editar_alimentacao:
              "Criar, editar ou remover UM único evento de alimentação: café da manhã, almoço, " +
              "jantar, lanche.",
            criar_editar_evento_comum:
              "Criar, editar ou remover UM único evento comum: reunião, compromisso, tarefa, " +
              "lazer — qualquer coisa que não seja alimentação, sono ou exercício.",
            criar_editar_sono:
              "Criar, editar ou remover UM único evento de sono: dormir, cochilar, soneca.",
            criar_editar_exercicio:
              "Criar, editar ou remover UM único evento de exercício: corrida, treino, academia, " +
              "esportes.",
            criar_editar_multiplos:
              "Criar e/ou editar MAIS DE UM evento (de qualquer tipo acima) na mesma mensagem.",
            consultar_dados:
              "Pergunta ou pedido para ver, listar, contar ou consultar eventos/dados já " +
              "existentes, sem criar, editar ou remover nada.",
          },
        ),
      },
    });

    console.log(`\n"${comando}"`);
    console.log(`  intenção: ${resposta.answers.intencao.choice}`);
    console.log(`  confiança: ${resposta.answers.intencao.confidence.toFixed(2)}`);
    console.log(`  probabilidades:`, resposta.answers.intencao.probabilities);
  }
}

async function main() {
  const client = new TypeSafeClient();

  console.log("=== Intenção do comando (tipo de evento único, múltiplos ou consulta) ===");
  await testarIntencaoDoComando(client);
}

main().catch((error) => {
  console.error("Falha ao chamar o Jev:", error);
  process.exitCode = 1;
});
