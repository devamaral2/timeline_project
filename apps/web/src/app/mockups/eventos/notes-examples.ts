export type NotePreview = { id: string; group: string; title: string; body: string; source: string; time: string; tags: string[] };

// Conteúdo ilustrativo dos HTMLs do design system.
export const noteExamples: NotePreview[] = [
  {
    "id": "1",
    "group": "Hoje",
    "title": "Frango grelhado com arroz integral e legumes",
    "body": "Informações nutricionais e receita. 512 kcal, 51 g de proteína, preparo em 35 min.",
    "source": "Evento · Almoço",
    "time": "09:40",
    "tags": [
      "caseiro"
    ]
  },
  {
    "id": "2",
    "group": "Hoje",
    "title": "Treino A · peito e tríceps",
    "body": "415 kcal gastas em 1 h. Esteira por 20 min e musculação com supino, crucifixo e tríceps na polia.",
    "source": "Evento · Academia",
    "time": "08:05",
    "tags": [
      "saúde",
      "força"
    ]
  },
  {
    "id": "3",
    "group": "Hoje",
    "title": "Noite de 13 para 14 de setembro",
    "body": "Pontuação do sono 82 de 100. O app registrou 7 h 02; na agenda foram 7 h 30.",
    "source": "Evento · Noite de sono",
    "time": "06:45",
    "tags": []
  },
  {
    "id": "4",
    "group": "Ontem",
    "title": "Ideias para a proposta",
    "body": "Começar pelo problema do cliente, não pela solução. Mostrar o cronograma da segunda fase numa página só.",
    "source": "Tarefa · Revisar proposta",
    "time": "21:12",
    "tags": [
      "trabalho"
    ]
  },
  {
    "id": "5",
    "group": "Esta semana",
    "title": "Livros para ler",
    "body": "O avesso da pele, Torto arado, A hora da estrela e o novo da Conceição Evaristo.",
    "source": "Nota solta",
    "time": "sex., 11 set.",
    "tags": [
      "pessoal"
    ]
  },
  {
    "id": "6",
    "group": "Esta semana",
    "title": "Lista do mercado",
    "body": "Arroz integral, frango, brócolis, cenoura, azeite, café e aveia.",
    "source": "Nota solta",
    "time": "qua., 9 set.",
    "tags": [
      "casa"
    ]
  }
];
