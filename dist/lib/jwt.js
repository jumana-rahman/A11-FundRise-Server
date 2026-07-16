import { SignJWT, jwtVerify } from "jose";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
export async function signJWT(payload) {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(JWT_SECRET);
}
export async function verifyJWT(token) {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
}
