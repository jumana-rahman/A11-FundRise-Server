import { SignJWT, jwtVerify } from "jose";
import type { JWTPayload } from "../types";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export async function signJWT(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyJWT(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as unknown as JWTPayload;
}
