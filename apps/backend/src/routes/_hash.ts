import argon2 from '@node-rs/argon2';

/** Argon2id (NFR-04) — แบ่งออกมาให้ routes/users.ts ใช้ร่วม */
export async function hashPassword(pw: string): Promise<string> {
  return String(
    await argon2.hash(pw, { memoryCost: 19456, timeCost: 2, outputLen: 32, type: argon2.argon2id }),
  );
}
