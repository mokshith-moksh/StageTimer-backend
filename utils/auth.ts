// utils/auth.ts
import { verifyToken } from "@clerk/backend"; // depends on your framework

export async function verifyClerkToken(token: string): Promise<string> {
  const payload = await verifyToken(token, {
    /* options: add necessary properties here */
  });
  return payload.sub; // userId
}
