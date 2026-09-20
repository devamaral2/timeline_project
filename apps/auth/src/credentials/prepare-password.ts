import { SemanticInputError } from "../common/errors";
import type { PasswordHasher } from "./password-hasher";
import { evaluatePassword } from "./password-policy";
import type { PwnedPasswordsGateway } from "./pwned-passwords.gateway";
export class PreparePassword { constructor(private readonly pwnedPasswords:PwnedPasswordsGateway,private readonly passwordHasher:PasswordHasher){} async execute(input:{password:string;normalizedEmail:string;name:string}){const policy=evaluatePassword(input);if(!policy.accepted)throw new SemanticInputError(policy.code);if(await this.pwnedPasswords.isCompromised(policy.passwordNfc))throw new SemanticInputError("password_compromised");return{passwordNfc:policy.passwordNfc,passwordHash:await this.passwordHasher.hash(policy.passwordNfc)};} }
