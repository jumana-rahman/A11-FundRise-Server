import type { JWTPayload } from "../types";
export declare function signJWT(payload: JWTPayload): Promise<string>;
export declare function verifyJWT(token: string): Promise<JWTPayload>;
