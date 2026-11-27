import { describe, expect, it } from "vitest";
import { parseVtt } from "./vtt";

describe("legenda WebVTT", () => {
  it("lê as falas com início, fim e texto", () => {
    const vtt = `WEBVTT
Kind: captions
Language: pt

1
00:00:01.000 --> 00:00:03.500 align:start position:0%
Olá, pessoal.

00:01:05.250 --> 01:01:07.000
Segunda fala,
em duas linhas.
`;
    expect(parseVtt(vtt)).toEqual([
      { startSeconds: 1, endSeconds: 3.5, text: "Olá, pessoal." },
      { startSeconds: 65.25, endSeconds: 3667, text: "Segunda fala, em duas linhas." },
    ]);
  });

  it("aceita o tempo sem horas", () => {
    expect(parseVtt("WEBVTT\n\n00:02.000 --> 00:04.000\noi")).toEqual([{ startSeconds: 2, endSeconds: 4, text: "oi" }]);
  });

  it("tira as marcas e converte as entidades", () => {
    const vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<c.color>Tom &amp; Jerry</c> &lt;3&nbsp;ok <00:00:01.000>fim";
    expect(parseVtt(vtt)[0]?.text).toBe("Tom & Jerry <3 ok fim");
  });

  it("ignora NOTE, STYLE e falas vazias", () => {
    const vtt = "WEBVTT\n\nNOTE um comentário\n\nSTYLE\n::cue { color: red }\n\n00:00:00.000 --> 00:00:01.000\n\n\n00:00:02.000 --> 00:00:03.000\nvale";
    expect(parseVtt(vtt)).toEqual([{ startSeconds: 2, endSeconds: 3, text: "vale" }]);
  });

  it("entende quebras de linha do Windows", () => {
    expect(parseVtt("WEBVTT\r\n\r\n00:00:00.000 --> 00:00:01.000\r\noi\r\n")).toEqual([{ startSeconds: 0, endSeconds: 1, text: "oi" }]);
  });

  it("devolve vazio para um arquivo sem falas", () => {
    expect(parseVtt("WEBVTT\n")).toEqual([]);
  });
});
