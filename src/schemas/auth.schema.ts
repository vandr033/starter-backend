import { email, z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
  userId: z.number()
});

export const checkRefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
  userId: z.number()
});

export const logoutAllSchema = z.object({
  userId: z.number()
});

export const registerUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  phonePrefix: z.string().min(1).optional(),
  companyId: z.number().optional(),
});
  

export type RegisterDTO = z.infer<typeof registerSchema>;
export type LoginDTO = z.infer<typeof loginSchema>;
export type RefreshDTO = z.infer<typeof refreshSchema>;
export type CheckRefreshDTO = z.infer<typeof checkRefreshSchema>;
export type LogoutDTO = z.infer<typeof logoutSchema>;
export type LogoutAllDTO = z.infer<typeof logoutAllSchema>;


export type RegisterCustomerDTO = z.infer<typeof registerUserSchema>;