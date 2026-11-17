# 16: Documentos da tarefa

**What to build:** No detalhe da tarefa, o usuário vê os documentos ligados como cartões com o conteúdo inline e a relação de cada um, e adiciona um documento salvando na hora. Na edição, ordena, adiciona e remove documentos, com a fonte certa por tipo: alimentos com quantidade na refeição (como cópia), exercícios no treino, os próprios documentos nos demais.

**Blocked by:** 11, 13

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). No web: a seção de documentos do detalhe, os cartões de conteúdo do artefato na tarefa, a seção de documentos na edição e o conteúdo da refeição.

- [ ] O detalhe mostra a seção Documentos com cartões no desenho do web, usando o componente de conteúdo do ticket 11, recolhíveis.
- [ ] Na refeição, a seção mostra o total de calorias dos alimentos ligados.
- [ ] Adicionar pelo detalhe grava na hora, com a `revision` lida.
- [ ] Na edição, Subir, Descer e Remover reordenam e tiram a ligação sem apagar o documento; o que a tarefa criou fica sem posição.
- [ ] Refeição oferece alimentos globais e próprios e grava cada um como cópia com quantidade (`copyOf` e `quantity`); treino oferece exercícios globais por referência; os demais tipos oferecem os próprios documentos com relação `uses`.
- [ ] Salvar manda a lista inteira de documentos.
