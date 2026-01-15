// import type { Prisma } from '../prisma/client';
// import { MensajeApi } from '../types/MensajeApi';
// import { sanitizeBigInt } from '../utils/sanitizeBigInt';
// import {
//   buildNotFoundResponse,
//   buildServiceErrorResponse,
//   buildSuccessResponse,
// } from '../utils/mensajeApiUtils';
// import * as UserRepo from '../repositories/user.repo';

// const ENTITY_LABEL = 'User';

// export async function listUser(args?: Prisma.UserFindManyArgs): Promise<MensajeApi> {
//   try {
//     const records = await UserRepo.findMany(args);
//     return buildSuccessResponse(
//       `${ENTITY_LABEL} list retrieved successfully`,
//       sanitizeBigInt(records),
//     );
//   } catch (error) {
//     return buildServiceErrorResponse(ENTITY_LABEL, 'list', error);
//   }
// }

// export async function getUserById(
//   id: UserRepo.IdValue,
//   args?: Omit<Prisma.UserFindUniqueArgs, 'where'>,
// ): Promise<MensajeApi> {
//   try {
//     const record = await UserRepo.getById(id, args);
//     if (!record) {
//       return buildNotFoundResponse(ENTITY_LABEL);
//     }
//     return buildSuccessResponse(
//       `${ENTITY_LABEL} retrieved successfully`,
//       sanitizeBigInt(record),
//     );
//   } catch (error) {
//     return buildServiceErrorResponse(ENTITY_LABEL, 'retrieve', error);
//   }
// }

// export async function createUser(data: Prisma.UserCreateInput): Promise<MensajeApi> {
//   try {
//     const created = await UserRepo.create(data);
//     return buildSuccessResponse(
//       `${ENTITY_LABEL} created successfully`,
//       sanitizeBigInt(created),
//     );
//   } catch (error) {
//     return buildServiceErrorResponse(ENTITY_LABEL, 'create', error);
//   }
// }

// export async function updateUser(
//   id: UserRepo.IdValue,
//   data: Prisma.UserUpdateInput,
// ): Promise<MensajeApi> {
//   try {
//     const existing = await UserRepo.getById(id);
//     if (!existing) {
//       return buildNotFoundResponse(ENTITY_LABEL);
//     }
//     const updated = await UserRepo.updateById(id, data);
//     return buildSuccessResponse(
//       `${ENTITY_LABEL} updated successfully`,
//       sanitizeBigInt(updated),
//     );
//   } catch (error) {
//     return buildServiceErrorResponse(ENTITY_LABEL, 'update', error);
//   }
// }

// export async function deleteUser(id: UserRepo.IdValue): Promise<MensajeApi> {
//   try {
//     const existing = await UserRepo.getById(id);
//     if (!existing) {
//       return buildNotFoundResponse(ENTITY_LABEL);
//     }
//     await UserRepo.deleteById(id);
//     return buildSuccessResponse(
//       `${ENTITY_LABEL} deleted successfully`,
//       sanitizeBigInt(existing),
//     );
//   } catch (error) {
//     return buildServiceErrorResponse(ENTITY_LABEL, 'delete', error);
//   }
// }
