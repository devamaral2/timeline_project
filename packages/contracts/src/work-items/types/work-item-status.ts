/**
 * Os seis estados de uma tarefa. `todo` pode ter um dia sem hora; `scheduled`
 * tem dia e hora; `toDefine` ainda nao tem data; `inHold` espera por algo
 * fora do controle de quem a criou.
 */
export type WorkItemStatus = "todo" | "scheduled" | "toDefine" | "inHold" | "done" | "cancel";
