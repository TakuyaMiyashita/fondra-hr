import { z } from 'zod';

import { orderField, pageField, perPageField } from './common';

export const auditLogListQuerySchema = z.object({
  page: pageField,
  perPage: perPageField(20),
  resourceType: z.string().optional(),
  action: z.string().optional(),
  order: orderField,
});

export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;
