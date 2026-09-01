export interface PasswordHasher { hash(passwordNfc:string):Promise<string>; verify(passwordNfc:string,encodedHash:string):Promise<boolean>; }
