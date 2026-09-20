import { describe, expect, it } from "vitest";
import { LoginCredentialChecker } from "./login-credential-checker";
describe("LoginCredentialChecker",()=>it("uses its dummy hash when no usable user exists",async()=>{let checked="";const c=new LoginCredentialChecker({verify:async(_p:string,h:string)=>{checked=h;return false;}} as never,"dummy");await c.check(null,"password");expect(checked).toBe("dummy");}));
