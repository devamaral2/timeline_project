import type { PasswordHasher } from "../../../auth-core/password/password-hasher";
import type { User } from "../../../domain/users/user";
/** Always performs one KDF, so callers cannot turn this into an account oracle. */
function usableScryptHash(value:string|null|undefined):value is string { if(!value)return false;const p=value.split("$");return p.length===6&&p[0]==="scrypt"&&p[1]==="32768"&&p[2]==="8"&&p[3]==="1"&&/^[A-Za-z0-9_-]{22}$/.test(p[4]!)&&/^[A-Za-z0-9_-]{86}$/.test(p[5]!); }
export class LoginCredentialChecker { constructor(private readonly hasher:PasswordHasher,private readonly dummyHash:string){} async check(user:User|null,password:string):Promise<boolean>{const hash=user?.status==="active"&&usableScryptHash(user.passwordHash)?user.passwordHash:this.dummyHash;const valid=await this.hasher.verify(password.normalize("NFC"),hash);return Boolean(user?.status==="active"&&usableScryptHash(user.passwordHash)&&valid);}}
