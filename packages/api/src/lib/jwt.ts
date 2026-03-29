import { SignJWT, jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'emcomm-dev-secret-change-in-production',
);

export interface JwtPayload {
  sub: string; // operator id
  callsign: string;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ callsign: payload.callsign })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(SECRET_KEY);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, SECRET_KEY);
  return {
    sub: payload.sub as string,
    callsign: payload['callsign'] as string,
  };
}
