/** O projeto de todo cartão e pedido dos fixtures: o `personal`, o padrão de quem não escolheu nenhum. */
export const PERSONAL_PROJECT = { id: "project-personal", name: "personal", personal: true } as const;

/** Um projeto que não é o `personal`: a marca dele tem cor, e o cartão, o detalhe e o pedido o trazem pelo nome. */
export const TIMELINE_PROJECT = { id: "project-timeline", name: "timeline_project", personal: false } as const;

/** Outro projeto, de uma palavra só: as iniciais saem dos dois primeiros caracteres. */
export const AGENT_SKILLS_PROJECT = { id: "project-skills", name: "agent-skills", personal: false } as const;

/** Um nome com acento: a busca do seletor acha "Açaí" digitando "acai". */
export const ACAI_PROJECT = { id: "project-acai", name: "Açaí", personal: false } as const;
