import type { FastifyInstance } from 'fastify';
import type { PlatformSnapshot } from '@sg/shared/schemas/adminStats';
import { adminStatsResponseSchema } from '../../schemas/adminStats.js';
import { handoffTeamWorkspaceRecoveryOutreachBodySchema } from '../../schemas/teamWorkspace.js';
import { deliverRecoveryOutreachCrmSync } from '../../recoveryOutreach/deliverRecoveryOutreachCrmSync.js';
import { deliverRecoveryFallbackMemberEmail } from '../../recoveryOutreach/deliverRecoveryFallbackMemberEmail.js';
import { deliverRecoveryOutreachOwnerEmail } from '../../recoveryOutreach/deliverRecoveryOutreachOwnerEmail.js';
import { runRecoveryOutreachPlaybook } from '../../recoveryOutreach/runRecoveryOutreachPlaybook.js';
import { deliverRecoveryOutreachWebhook } from '../../recoveryOutreach/deliverRecoveryOutreachWebhook.js';
import { deliverRecoveryOutreachSlackAlert } from '../../recoveryOutreach/deliverRecoveryOutreachSlackAlert.js';

import { fetchAdminStatsPayload } from './stats/fetchStats.js';
import { buildPlatformSnapshot } from './stats/platformSnapshot.js';
import { fetchCommercialStats } from './stats/commercialContent.js';
import {
  failedRecoveryPlaybookSteps,
  recoveryPlaybookRerunBodySchema,
  recoveryWebhookDeliveryBodySchema,
  recoverySlackDeliveryBodySchema,
} from './stats/shared.js';
import {
  renderPlatformSnapshotReportCsv,
  renderPlatformSnapshotBriefMarkdown,
  renderRecoveryQueueCsv,
  renderRecoveryHandoffCsv,
} from './stats/renderers.js';

export async function capturePlatformSnapshot(
  app: FastifyInstance,
  triggerType: PlatformSnapshot['triggerType'],
) {
  const statsPayload = await fetchAdminStatsPayload(app);
  const snapshot = buildPlatformSnapshot(statsPayload.platform, triggerType);
  app.observability.recordPlatformSnapshot(snapshot);
  const alertDelivery = await app.platformAlertDispatcher
    .dispatch(statsPayload.platform.alerts, snapshot.createdAt)
    .catch((error: unknown) => {
      app.log.error({ error }, 'Platform alert control plane failed after snapshot capture');
      return {
        configuredChannels: app.platformAlertDispatcher.configuredChannels(),
        delivered: 0,
        failed: 0,
        suppressed: 0,
        resolved: 0,
        controlPlaneFailures: 1,
      };
    });
  const auditItem = await app.auditRepo.record({
    action: 'platform.snapshot_captured',
    metadata: {
      snapshot,
      alertDelivery,
    },
  });
  return {
    auditId: auditItem.id,
    snapshot,
    alertDelivery,
  };
}

export async function adminStatsRoutes(app: FastifyInstance) {
  app.get('/', async (_request, reply) => {
    try {
      const statsPayload = await fetchAdminStatsPayload(app);
      return reply.send(adminStatsResponseSchema.parse(statsPayload));
    } catch (err) {
      app.log.error(err, 'Failed to fetch admin stats');
      return reply.code(500).send({ error: 'stats_unavailable' });
    }
  });

  app.post('/platform-snapshot', async (_request, reply) => {
    try {
      const captured = await capturePlatformSnapshot(app, 'manual');
      return reply.send({
        ok: true,
        auditId: captured.auditId,
        snapshot: captured.snapshot,
      });
    } catch (err) {
      app.log.error(err, 'Failed to capture platform snapshot');
      return reply.code(500).send({ error: 'platform_snapshot_unavailable' });
    }
  });

  app.get('/platform-snapshot-report.csv', async (_request, reply) => {
    try {
      const statsPayload = await fetchAdminStatsPayload(app);
      const csv = renderPlatformSnapshotReportCsv(statsPayload.platform);
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header(
        'content-disposition',
        `attachment; filename="platform-snapshot-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      return reply.send(csv);
    } catch (err) {
      app.log.error(err, 'Failed to export platform snapshot report');
      return reply.code(500).send({ error: 'platform_snapshot_report_unavailable' });
    }
  });

  app.get('/platform-snapshot-brief.md', async (_request, reply) => {
    try {
      const statsPayload = await fetchAdminStatsPayload(app);
      const markdown = renderPlatformSnapshotBriefMarkdown(statsPayload.platform);
      reply.header('content-type', 'text/markdown; charset=utf-8');
      reply.header(
        'content-disposition',
        `attachment; filename="platform-snapshot-brief-${new Date().toISOString().slice(0, 10)}.md"`,
      );
      return reply.send(markdown);
    } catch (err) {
      app.log.error(err, 'Failed to export platform snapshot brief');
      return reply.code(500).send({ error: 'platform_snapshot_brief_unavailable' });
    }
  });

  app.get('/recovery-queue.csv', async (_request, reply) => {
    try {
      const commercialStats = await fetchCommercialStats(app);
      const rows = commercialStats.teamWorkspaces.actionableWorkspaces;
      const csv = renderRecoveryQueueCsv(rows);
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header(
        'content-disposition',
        `attachment; filename="team-workspace-recovery-queue-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      return reply.send(csv);
    } catch (err) {
      app.log.error(err, 'Failed to export workspace recovery queue');
      return reply.code(500).send({ error: 'recovery_queue_export_unavailable' });
    }
  });

  app.post('/recovery-handoffs/export', async (_request, reply) => {
    try {
      const { exportedCount } = await app.teamWorkspacesRepo.exportHandedOffAdminRecoveryOutreach();
      const commercialStats = await fetchCommercialStats(app);
      const rows = commercialStats.teamWorkspaces.actionableWorkspaces.filter(
        (item) => item.lastOutreachStatus === 'handed_off',
      );
      const csv = renderRecoveryHandoffCsv(rows);
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header(
        'content-disposition',
        `attachment; filename="team-workspace-recovery-handoffs-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      reply.header('x-recovery-handoff-exported-count', String(exportedCount));
      return reply.send(csv);
    } catch (err) {
      app.log.error(err, 'Failed to export recovery handoff CSV');
      return reply.code(500).send({ error: 'recovery_handoff_export_unavailable' });
    }
  });

  app.post('/recovery-owner-email', async (_request, reply) => {
    try {
      const parsed = recoveryWebhookDeliveryBodySchema.safeParse(_request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_recovery_owner_email_body' });
      }
      const delivered = await deliverRecoveryOutreachOwnerEmail(
        app.teamWorkspacesRepo,
        parsed.data,
      );
      if (!delivered.ok) {
        return reply.code(delivered.error === 'recovery_owner_email_disabled' ? 503 : 502).send({
          error: delivered.error,
          detail: delivered.detail,
          attemptedCount: delivered.attemptedCount,
          deliveredCount: delivered.deliveredCount,
          failedCount: delivered.failedCount,
        });
      }
      return reply.send({
        ok: true,
        attemptedCount: delivered.attemptedCount,
        deliveredCount: delivered.deliveredCount,
        failedCount: delivered.failedCount,
        skipped: delivered.skipped,
      });
    } catch (err) {
      app.log.error(err, 'Failed to deliver recovery owner emails');
      return reply.code(500).send({ error: 'recovery_owner_email_unavailable' });
    }
  });

  app.post('/recovery-member-email', async (_request, reply) => {
    try {
      const parsed = recoveryWebhookDeliveryBodySchema.safeParse(_request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_recovery_member_email_body' });
      }
      const delivered = await deliverRecoveryFallbackMemberEmail(
        app.teamWorkspacesRepo,
        parsed.data,
      );
      if (!delivered.ok) {
        return reply.code(delivered.error === 'recovery_member_email_disabled' ? 503 : 502).send({
          error: delivered.error,
          detail: delivered.detail,
          attemptedCount: delivered.attemptedCount,
          deliveredCount: delivered.deliveredCount,
          failedCount: delivered.failedCount,
        });
      }
      return reply.send({
        ok: true,
        attemptedCount: delivered.attemptedCount,
        deliveredCount: delivered.deliveredCount,
        failedCount: delivered.failedCount,
        skipped: delivered.skipped,
      });
    } catch (err) {
      app.log.error(err, 'Failed to deliver member recovery emails');
      return reply.code(500).send({ error: 'recovery_member_email_unavailable' });
    }
  });

  app.post('/recovery-playbook', async (_request, reply) => {
    try {
      const parsed = recoveryWebhookDeliveryBodySchema.safeParse(_request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_recovery_playbook_body' });
      }
      const played = await runRecoveryOutreachPlaybook(app.teamWorkspacesRepo, {
        ...parsed.data,
        triggerType: 'manual',
      });
      if (!played.ok) {
        return reply.code(502).send({
          error: 'recovery_playbook_failed',
          summary: played.summary,
          steps: played.steps,
        });
      }
      return reply.send({
        ok: true,
        summary: played.summary,
        steps: played.steps,
      });
    } catch (err) {
      app.log.error(err, 'Failed to run recovery playbook');
      return reply.code(500).send({ error: 'recovery_playbook_unavailable' });
    }
  });

  app.post('/recovery-playbook/rerun-failed', async (_request, reply) => {
    try {
      const parsed = recoveryPlaybookRerunBodySchema.safeParse(_request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_recovery_playbook_rerun_body' });
      }
      const previousRun = await app.teamWorkspacesRepo.getRecoveryPlaybookRunById(
        parsed.data.runId,
      );
      if (!previousRun) {
        return reply.code(404).send({ error: 'recovery_playbook_run_not_found' });
      }
      const requestedSteps = failedRecoveryPlaybookSteps(previousRun);
      if (requestedSteps.length === 0) {
        return reply.code(409).send({ error: 'recovery_playbook_no_failed_steps' });
      }
      const played = await runRecoveryOutreachPlaybook(app.teamWorkspacesRepo, {
        retryIntervalHours: parsed.data.retryIntervalHours ?? previousRun.retryIntervalHours,
        force: parsed.data.force ?? true,
        triggerType: 'manual_rerun',
        onlySteps: requestedSteps,
        rerunOfRunId: previousRun.id,
      });
      if (!played.ok) {
        return reply.code(502).send({
          error: 'recovery_playbook_rerun_failed',
          summary: played.summary,
          steps: played.steps,
          rerunOfRunId: previousRun.id,
          requestedSteps,
        });
      }
      return reply.send({
        ok: true,
        summary: played.summary,
        steps: played.steps,
        rerunOfRunId: previousRun.id,
        requestedSteps,
      });
    } catch (err) {
      app.log.error(err, 'Failed to rerun failed recovery playbook steps');
      return reply.code(500).send({ error: 'recovery_playbook_rerun_unavailable' });
    }
  });

  app.post('/recovery-handoffs/crm', async (_request, reply) => {
    try {
      const parsed = recoveryWebhookDeliveryBodySchema.safeParse(_request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_recovery_crm_delivery_body' });
      }
      const delivered = await deliverRecoveryOutreachCrmSync(app.teamWorkspacesRepo, parsed.data);
      if (!delivered.ok) {
        return reply.code(delivered.error === 'recovery_handoff_crm_disabled' ? 503 : 502).send({
          error: delivered.error,
          detail: delivered.detail,
          attemptedCount: delivered.attemptedCount,
          syncedCount: delivered.syncedCount,
          failedCount: delivered.failedCount,
        });
      }
      return reply.send({
        ok: true,
        attemptedCount: delivered.attemptedCount,
        syncedCount: delivered.syncedCount,
        failedCount: delivered.failedCount,
        skipped: delivered.skipped,
      });
    } catch (err) {
      app.log.error(err, 'Failed to sync recovery handoffs to CRM API');
      return reply.code(500).send({ error: 'recovery_handoff_crm_unavailable' });
    }
  });

  app.post('/recovery-handoffs/webhook', async (_request, reply) => {
    try {
      const parsed = recoveryWebhookDeliveryBodySchema.safeParse(_request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_recovery_webhook_delivery_body' });
      }
      const delivered = await deliverRecoveryOutreachWebhook(app.teamWorkspacesRepo, parsed.data);
      if (!delivered.ok) {
        return reply
          .code(delivered.error === 'recovery_handoff_webhook_disabled' ? 503 : 502)
          .send({
            error: delivered.error,
            detail: delivered.detail,
            attemptedCount: delivered.attemptedCount,
            deliveredCount: delivered.deliveredCount,
            statusCode: delivered.statusCode,
          });
      }
      return reply.send({
        ok: true,
        attemptedCount: delivered.attemptedCount,
        deliveredCount: delivered.deliveredCount,
        statusCode: delivered.statusCode,
        skipped: delivered.skipped,
      });
    } catch (err) {
      app.log.error(err, 'Failed to deliver recovery handoffs via webhook');
      return reply.code(500).send({ error: 'recovery_handoff_webhook_unavailable' });
    }
  });

  app.post('/recovery-handoffs/slack', async (_request, reply) => {
    try {
      const parsed = recoverySlackDeliveryBodySchema.safeParse(_request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_recovery_slack_delivery_body' });
      }
      const delivered = await deliverRecoveryOutreachSlackAlert(
        app.teamWorkspacesRepo,
        parsed.data,
      );
      if (!delivered.ok) {
        return reply.code(delivered.error === 'recovery_slack_alert_disabled' ? 503 : 502).send({
          error: delivered.error,
          detail: delivered.detail,
          attemptedCount: delivered.attemptedCount,
          alertedCount: delivered.alertedCount,
          statusCode: delivered.statusCode,
        });
      }
      return reply.send({
        ok: true,
        attemptedCount: delivered.attemptedCount,
        alertedCount: delivered.alertedCount,
        statusCode: delivered.statusCode,
        skipped: delivered.skipped,
      });
    } catch (err) {
      app.log.error(err, 'Failed to deliver recovery handoffs to Slack');
      return reply.code(500).send({ error: 'recovery_slack_alert_unavailable' });
    }
  });

  app.post('/recovery-outreach/handoff', async (request, reply) => {
    const parsed = handoffTeamWorkspaceRecoveryOutreachBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_recovery_outreach_handoff_body' });
    }
    const result = await app.teamWorkspacesRepo.handoffAdminRecoveryOutreach(parsed.data);
    if (result === 'workspace_not_found' || result === 'outreach_not_found') {
      return reply.code(404).send({ error: result });
    }
    return reply.send({ ok: true });
  });
}

export { buildPlatformSnapshot } from './stats/platformSnapshot.js';
export { fetchAdminStatsPayload } from './stats/fetchStats.js';
