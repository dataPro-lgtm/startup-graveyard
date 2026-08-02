import { z } from 'zod';

export const listAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const auditItemSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  reviewId: z.string().uuid().nullable(),
  caseId: z.string().uuid().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  actorUserId: z.string().uuid().nullable(),
  actorEmail: z.string().email().nullable(),
  actorAdminRole: z.enum(['viewer', 'editor', 'operator', 'owner']).nullable(),
  actorAuthType: z.enum(['user_session', 'service_key', 'system']).nullable(),
  createdAt: z.string(),
});

export const listAuditResponseSchema = z.object({
  items: z.array(auditItemSchema),
});
