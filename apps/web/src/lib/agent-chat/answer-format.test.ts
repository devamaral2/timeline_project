import { expect, test } from "vitest";
import { type AnswerNode, answerChoices, choiceLabel, remarkAnswer, shortUrl } from "./answer-format";

test("as alternativas entre aspas ligadas por ou viram escolhas", () => {
  expect(answerChoices('Diga "só gmail" ou "com calendar e drive" e eu gero a URL.')).toEqual(["só gmail", "com calendar e drive"]);
  expect(answerChoices("Responda “sim”, “não” ou “depois”.")).toEqual(["sim", "não", "depois"]);
});

test("uma citação sozinha ou citações soltas no texto não são escolha", () => {
  expect(answerChoices('Basta clicar em "Ativar/Enable".')).toEqual([]);
  expect(answerChoices('O botão "Salvar" fica ao lado do campo "Nome".')).toEqual([]);
});

test("o rótulo da escolha começa com maiúscula", () => {
  expect(choiceLabel("só gmail")).toBe("Só gmail");
});

test("o endereço perde o protocolo e, quando longo, fica no primeiro trecho do caminho", () => {
  expect(shortUrl("https://console.cloud.google.com/apis/library")).toBe("console.cloud.google.com/apis/library");
  expect(shortUrl("https://console.cloud.google.com/projectselector2/home/dashboard")).toBe("console.cloud.google.com/projectselector2…");
  expect(shortUrl("https://www.exemplo.com/?q=1")).toBe("exemplo.com");
});

function paragraph(value: string): AnswerNode {
  return { type: "paragraph", children: [{ type: "text", value }] };
}

test("caminhos e constantes viram código, e o começo com dois-pontos vira destaque", () => {
  const tree: AnswerNode = {
    type: "root",
    children: [paragraph("Uma decisão antes: o estado é NOT_AUTHENTICATED, com token em /opt/data/google_token.json.")],
  };
  remarkAnswer()(tree);

  const nodes = tree.children?.[0].children ?? [];
  expect(nodes[0]).toEqual({ type: "strong", children: [{ type: "text", value: "Uma decisão antes:" }] });
  expect(nodes.filter((node) => node.type === "inlineCode").map((node) => node.value)).toEqual([
    "NOT_AUTHENTICATED",
    "/opt/data/google_token.json",
  ]);
});

test("o parágrafo curto antes de uma lista vira o rótulo dela; o endereço de um link não é mexido", () => {
  const tree: AnswerNode = {
    type: "root",
    children: [
      paragraph("Os passos:"),
      {
        type: "list",
        children: [{
          type: "listItem",
          children: [{ type: "paragraph", children: [{ type: "link", children: [{ type: "text", value: "https://a.com/x/y/z.html" }] }] }],
        }],
      },
    ],
  };
  remarkAnswer()(tree);

  expect(tree.children?.[0]).toEqual({
    type: "paragraph",
    children: [{ type: "text", value: "Os passos" }],
    data: { hProperties: { "data-label": "true" } },
  });
  const link = tree.children?.[1].children?.[0].children?.[0].children?.[0];
  expect(link?.children).toEqual([{ type: "text", value: "https://a.com/x/y/z.html" }]);
});
