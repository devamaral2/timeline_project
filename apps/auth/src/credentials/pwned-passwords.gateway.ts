export interface PwnedPasswordsGateway { isCompromised(passwordNfc:string):Promise<boolean>; }
