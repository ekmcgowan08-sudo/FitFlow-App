/**
 * Zod schema suite — admin user/role management.
 */
import { z } from 'zod';
import { RoleCode } from '@prisma/client';

export const userIdParamsSchema = z.object({
  id: z.string().uuid('User id must be a valid UUID.'),
});

export const roleCodeParamsSchema = z.object({
  id: z.string().uuid('User id must be a valid UUID.'),
  code: z.nativeEnum(RoleCode),
});

/** POST /v1/admin/users/:id/roles (ADMIN only) */
export const grantRoleSchema = z.object({ code: z.nativeEnum(RoleCode) }).strict();
export type GrantRoleInput = z.infer<typeof grantRoleSchema>;
