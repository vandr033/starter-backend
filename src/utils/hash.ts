// src/utils/hash.ts
import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export async function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, ROUNDS);
}

export async function verifyCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
