import { SemanticInputError } from "../common/errors";
import type { PasswordHasher } from "./password-hasher";
import { evaluatePassword } from "./password-policy";
export class PreparePassword { constructor(private readonly passwordHasher:PasswordHasher){} async execute(input:{password:string;normalizedEmail:string;name:string}){const policy=evaluatePassword(input);if(!policy.accepted)throw new SemanticInputError(policy.code);return{passwordNfc:policy.passwordNfc,passwordHash:await this.passwordHasher.hash(policy.passwordNfc)};} }
