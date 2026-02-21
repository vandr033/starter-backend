// // import { pool } from '../db/pool';
// // import { RowDataPacket, ResultSetHeader } from 'mysql2';
// import crypto from 'crypto';
// import { Prisma, prisma } from '../prisma/client';

// export function sha256(s: string): string {
//   return crypto.createHash('sha256').update(s).digest('hex');
// }


// type CreateSessionParams = {
//   userId: number;
//   companyId?: number | null;
//   refreshToken: string;
//   issuedAt?: Date;
//   expiresAt: Date;
//   ipAddress?: string | null;
//   userAgent?: string | null;
// };

// export const createAuthSession = async ({
//   userId,
//   companyId,
//   refreshToken,
//   issuedAt,
//   expiresAt,
//   ipAddress,
//   userAgent,
// }: CreateSessionParams) => {
//   const now = new Date();
//   const tokenHash = sha256(refreshToken);

//   const data: Prisma.AuthSessionCreateInput = {
//     refresh_token_hash: tokenHash,
//     issued_at: issuedAt ?? now,
//     expires_at: expiresAt,
//     revoked_at: null,
//     ip_address: ipAddress ?? null,
//     user_agent: userAgent ?? null,
//     created_at: now,
//     updated_at: now,
//     user: {
//       connect: { id: userId },
//     },
//   };

//   if (companyId != null) {
//     data.company = {
//       connect: { id: companyId },
//     };
//   }

//   return prisma.authSession.create({ data });
// };

// export const getSessionByRefreshToken = (token: string) => {
//   const hash = sha256(token);
//   return prisma.authSession.findUnique({
//     where: { refresh_token_hash: hash },
//   });
// };

// export const revokeSessionById = async (id: number) => {
//   const now = new Date();
//   return prisma.authSession.update({
//     where: { id: id },
//     data: {
//       revoked_at: now,
//       updated_at: now,
//     },
//   });
// };

// export const revokeSessionByRefreshToken = async (token: string) => {
//   const session = await getSessionByRefreshToken(token);
//   if (!session) return null;
//   await revokeSessionById(session.id);
//   return session;
// };

// export const revokeAllSessionsForUser = (userId: number) => {
//   const now = new Date();
//   return prisma.authSession.updateMany({
//     where: { user_id: userId, revoked_at: null },
//     data: {
//       revoked_at: now,
//       updated_at: now,
//     },
//   });
// };

// export const deleteSessionById = (id: number) =>
//   prisma.authSession.delete({ where: { id: id } });


// // export async function consumeRefreshToken(userId: number, token: string): Promise<RefreshToken | null> {
// //     try{

// //     const tokenHash = sha256(token);
// //     const [rows]=await pool.execute<(RefreshToken & RowDataPacket)[]>(
// //         'SELECT * FROM refresh_tokens WHERE user_id = ? AND token_hash = ?',
// //         [userId, tokenHash]
// //     );
// //     const row = rows[0];
// //     if(!row) throw new Error('Refresh token not found');
// //     if(row.expires_at < new Date()) throw new Error('Refresh token expired');
// //     await pool.execute<ResultSetHeader>(
// //         'DELETE FROM refresh_tokens WHERE id = ?',
// //         [row.id]
// //     );
// //     return { id: row.id, userId: row.user_id, tokenHash: row.token_hash, expiresAt: row.expires_at, createdAt: row.created_at };
// //     } catch (error) {
// //         return null;
// //     }
// // }

// // export async function revokeAllRefreshTokens(userId: number): Promise<void> {
// //     await pool.execute<ResultSetHeader>(
// //         'DELETE FROM refresh_tokens WHERE user_id = ?',
// //         [userId]
// //     );
// // }

// // export async function revokeRefreshToken(userId: number, token: string): Promise<boolean> {
// //     try {
// //         const tokenHash = sha256(token);
// //         const [result] = await pool.execute<ResultSetHeader>(
// //             'DELETE FROM refresh_tokens WHERE user_id = ? AND token_hash = ?',
// //             [userId, tokenHash]
// //         );
// //         return result.affectedRows > 0;
// //     } catch (error) {
// //         return false;
// //     }
// // }
