import type { PasswordHasher } from "../credentials/password-hasher";
import type { User } from "../users/user";
/** Always performs one KDF, so callers cannot turn this into an account oracle. */
export class LoginCredentialChecker { constructor(private readonly hasher:PasswordHasher,private readonly dummyHash:string){} async check(user:User|null,password:string):Promise<boolean>{const hash=user?.status==="active"&&user.passwordHash?user.passwordHash:this.dummyHash;const valid=await this.hasher.verify(password.normalize("NFC"),hash);return Boolean(user?.status==="active"&&user.passwordHash&&valid);}}
