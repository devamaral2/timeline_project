/** O nome de projeto nao serve: vazio, ou maior que o limite, depois de tirar os espacos das pontas. */
export class ProjectValidationError extends Error {}

/** O usuario ja tem um projeto com esse nome, sem distinguir maiusculas de minusculas. */
export class ProjectNameTakenError extends Error {}

/** O projeto nao existe ou nao e do usuario: quem pede nao descobre qual dos dois. */
export class ProjectNotFoundError extends Error {}
