import argon2 from '@node-rs/argon2';

/** Argon2id (NFR-04) — แบ่งออกมาให้ routes/users.ts ใช้ร่วม */
export async function hashPassword(pw: string): Promise<string> {
  // Argon2id (NFR-04) — Algorithm.Argon2id = 2 (ใช้ค่าตัวเลขตรงเพื่อเข้ากันได้กับ tsx/esbuild)
  return String(await argon2.hash(pw, { memoryCost: 19456, timeCost: 2, outputLen: 32, algorithm: 2 }));
}
