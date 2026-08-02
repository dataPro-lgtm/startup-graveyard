import type { PlatformAlert } from '@sg/shared/schemas/adminStats';
import type { AuditRepository } from '../repositories/auditRepository.js';
import type {
  PlatformAlertChannel,
  PlatformAlertDeliverySeverity,
  PlatformAlertDeliveryState,
  PlatformAlertStatesRepository,
} from '../repositories/platformAlertStatesRepository.js';
import type { ObservabilityRuntime } from './runtime.js';

export type PlatformAlertDispatcherConfig = {
  environment: string;
  cooldownMs: number;
  retryMs: number;
  timeoutMs: number;
  webhookUrl: string;
  webhookBearerToken: string;
  slackWebhookUrl: string;
};

export type PlatformAlertDispatchSummary = {
  configuredChannels: PlatformAlertChannel[];
  delivered: number;
  failed: number;
  suppressed: number;
  resolved: number;
  controlPlaneFailures: number;
};

type DispatcherLogger = {
  info: (fields: Record<string, unknown>, message: string) => void;
  error: (fields: Record<string, unknown>, message: string) => void;
};

type Fetcher = typeof fetch;

function clipError(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.length <= 1_000 ? text : text.slice(0, 1_000);
}

function alertSeverity(alert: PlatformAlert): PlatformAlertDeliverySeverity | null {
  return alert.severity === 'critical' || alert.severity === 'warning' ? alert.severity : null;
}

function nextRetryAt(attemptedAt: string, retryMs: number): string {
  return new Date(Date.parse(attemptedAt) + retryMs).toISOString();
}

export class PlatformAlertDispatcher {
  constructor(
    private readonly states: PlatformAlertStatesRepository,
    private readonly audit: AuditRepository,
    private readonly observability: ObservabilityRuntime,
    private readonly config: PlatformAlertDispatcherConfig,
    private readonly logger: DispatcherLogger,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  configuredChannels(): PlatformAlertChannel[] {
    const channels: PlatformAlertChannel[] = [];
    if (this.config.webhookUrl) channels.push('webhook');
    if (this.config.slackWebhookUrl) channels.push('slack');
    return channels;
  }

  async dispatch(
    alerts: PlatformAlert[],
    observedAt = new Date().toISOString(),
  ): Promise<PlatformAlertDispatchSummary> {
    const channels = this.configuredChannels();
    const activeAlerts = alerts
      .map((alert) => ({ alert, severity: alertSeverity(alert) }))
      .filter(
        (item): item is { alert: PlatformAlert; severity: PlatformAlertDeliverySeverity } =>
          item.severity != null,
      );
    const summary: PlatformAlertDispatchSummary = {
      configuredChannels: channels,
      delivered: 0,
      failed: 0,
      suppressed: 0,
      resolved: 0,
      controlPlaneFailures: 0,
    };

    for (const channel of channels) {
      for (const { alert, severity } of activeAlerts) {
        const claim = await this.states.claimDelivery({
          alertCode: alert.code,
          channel,
          severity,
          observedAt,
          cooldownMs: this.config.cooldownMs,
          metadata: { title: alert.title, detail: alert.detail, href: alert.href },
        });
        if (!claim.claimed) {
          summary.suppressed += 1;
          this.observability.recordAlertDelivery({ channel, severity, outcome: 'suppressed' });
          continue;
        }
        const delivered = await this.deliver(channel, 'firing', alert, claim.state, observedAt);
        if (delivered) summary.delivered += 1;
        else summary.failed += 1;
      }

      const resolved = await this.states.resolveInactive({
        channel,
        activeAlertCodes: activeAlerts.map(({ alert }) => alert.code),
        resolvedAt: observedAt,
        retryMs: this.config.retryMs,
      });
      for (const state of resolved) {
        if (await this.deliver(channel, 'resolved', null, state, observedAt)) {
          summary.resolved += 1;
        } else {
          summary.failed += 1;
        }
      }
    }

    if (
      channels.length > 0 &&
      (summary.delivered > 0 || summary.failed > 0 || summary.resolved > 0)
    ) {
      await this.audit.record({
        action: 'platform.alert_delivery_evaluated',
        metadata: { observedAt, ...summary },
      });
    }
    return summary;
  }

  private async deliver(
    channel: PlatformAlertChannel,
    status: 'firing' | 'resolved',
    alert: PlatformAlert | null,
    state: PlatformAlertDeliveryState,
    attemptedAt: string,
  ): Promise<boolean> {
    const url = channel === 'webhook' ? this.config.webhookUrl : this.config.slackWebhookUrl;
    const severity = alert ? (alertSeverity(alert) ?? state.severity) : state.severity;
    const idempotencyKey = [
      state.alertCode,
      channel,
      state.firstSeenAt,
      status,
      severity,
      state.deliveryCount,
    ].join(':');
    const payload =
      channel === 'slack'
        ? {
            text:
              status === 'resolved'
                ? `[RESOLVED] ${state.alertCode} on ${this.config.environment}`
                : `[${severity.toUpperCase()}] ${alert?.title}\n${alert?.detail}`,
          }
        : {
            type: 'startup_graveyard.platform_alert',
            status,
            environment: this.config.environment,
            observedAt: attemptedAt,
            alert: alert ?? {
              code: state.alertCode,
              severity: state.severity,
              title: state.metadata.title ?? state.alertCode,
              detail: state.metadata.detail ?? 'Alert condition recovered.',
              href: state.metadata.href ?? '/admin/dashboard',
            },
          };
    try {
      await this.observability.withSpan(
        'platform.alert.deliver',
        { channel, alert_code: state.alertCode, alert_status: status, alert_severity: severity },
        async () => {
          const response = await this.fetcher(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-sg-idempotency-key': idempotencyKey,
              ...(channel === 'webhook' && this.config.webhookBearerToken
                ? { authorization: `Bearer ${this.config.webhookBearerToken}` }
                : {}),
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(this.config.timeoutMs),
          });
          if (!response.ok) {
            throw new Error(`${channel} returned HTTP ${response.status}`);
          }
        },
      );
      await this.states.recordDeliveryResult({
        alertCode: state.alertCode,
        channel,
        attemptedAt,
        delivered: true,
        retryAt: null,
        error: null,
        deliveryStatus: status,
      });
      this.observability.recordAlertDelivery({
        channel,
        severity,
        outcome: status === 'resolved' ? 'resolved' : 'delivered',
      });
      this.logger.info({ channel, alertCode: state.alertCode, status }, 'Platform alert delivered');
      return true;
    } catch (error) {
      const message = clipError(error);
      await this.states.recordDeliveryResult({
        alertCode: state.alertCode,
        channel,
        attemptedAt,
        delivered: false,
        retryAt: nextRetryAt(attemptedAt, this.config.retryMs),
        error: message,
        deliveryStatus: status,
      });
      this.observability.recordAlertDelivery({ channel, severity, outcome: 'failed' });
      this.logger.error(
        { channel, alertCode: state.alertCode, status, error: message },
        'Platform alert delivery failed',
      );
      return false;
    }
  }
}
