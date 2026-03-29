import { SignJWT, jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'emcomm-dev-secret-change-in-production',
);

const TOKEN_EXPIRY = process.env.NODE_ENV === 'production' ? '8h' : '24h';

export interface JwtPayload {
  sub: string; // operator id
  callsign: string;
}

export async function signToken(payload: JwtPayload, expiresIn?: string): Promise<string> {
  return new SignJWT({ callsign: payload.callsign })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn ?? TOKEN_EXPIRY)
    .sign(SECRET_KEY);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, SECRET_KEY);
  return {
    sub: payload.sub as string,
    callsign: payload['callsign'] as string,
  };
}
