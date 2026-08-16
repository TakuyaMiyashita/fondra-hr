import { z } from 'zod';

export const auditLogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  resourceType: z.string().optional(),
  action: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;
