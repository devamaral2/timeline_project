/**
 * `POST /api/tasks/daily-reading`: uma página que a pessoa leu, já em markdown.
 * Vira um artefato de texto na tarefa "Leitura diária" do dia, que nasce junto
 * quando ainda não existe.
 */
export interface DailyReadingInput {
  /** O endereço da página, `http` ou `https`. */
  url: string;
  title: string;
  /** O texto da página em markdown (GFM). Imagens e vídeos entram como endereços, nunca como arquivo. */
  markdown: string;
  /** O nome do site, quando a página diz. */
  siteName?: string;
  /** Quem assina o texto. */
  byline?: string;
}

export interface DailyReadingResult {
  taskId: string;
  artifactId: string;
  /** A tarefa "Leitura diária" do dia nasceu agora. */
  taskCreated: boolean;
  /** `false` quando a página já estava na leitura do dia: o artefato dela foi atualizado, não repetido. */
  artifactCreated: boolean;
}
