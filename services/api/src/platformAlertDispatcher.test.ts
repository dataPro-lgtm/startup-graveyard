import { describe, expect, it, vi } from 'vitest';
import type { PlatformAlert } from '@sg/shared/schemas/adminStats';
import { MockAuditRepository } from './repositories/auditRepository.js';
import { MockPlatformAlertStatesRepository } from './repositories/platformAlertStatesRepository.js';
import { PlatformAlertDispatcher } from './observability/platformAlertDispatcher.js';
import { createDisabledObservability } from './observability/runtime.js';

const warning: PlatformAlert = {
  severity: 'warning',
  code: 'ingestion_queue_backlog',
  title: 'Queue backlog',
  detail: 'Queued work exceeded the operating threshold.',
  href: '/admin/dashboard',
};

function createDispatcher(fetcher: typeof fetch) {
  const audit = new MockAuditRepository();
  const dispatcher = new PlatformAlertDispatcher(
    new MockPlatformAlertStatesRepository(),
    audit,
    createDisabledObservability('worker'),
    {
      environment: 'test',
      cooldownMs: 60_000,
      retryMs: 5_000,
      timeoutMs: 1_000,
      webhookUrl: 'https://alerts.example.test/v1/events',
      webhookBearerToken: 'test-token',
      slackWebhookUrl: '',
    },
    { info: vi.fn(), error: vi.fn() },
    fetcher,
  );
  return { dispatcher, audit };
}

describe('platform alert dispatcher', () => {
  it('deduplicates during cooldown, delivers severity escalation, and sends one resolution', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    const { dispatcher, audit } = createDispatcher(fetcher);

    const first = await dispatcher.dispatch([warning], '2026-08-02T10:00:00.000Z');
    const duplicate = await dispatcher.dispatch([warning], '2026-08-02T10:00:30.000Z');
    const escalated = await dispatcher.dispatch(
      [{ ...warning, severity: 'critical' }],
      '2026-08-02T10:00:40.000Z',
    );
    const resolved = await dispatcher.dispatch([], '2026-08-02T10:00:50.000Z');
    const stillResolved = await dispatcher.dispatch([], '2026-08-02T10:00:55.000Z');

    expect(first).toMatchObject({ delivered: 1, suppressed: 0 });
    expect(duplicate).toMatchObject({ delivered: 0, suppressed: 1 });
    expect(escalated).toMatchObject({ delivered: 1, suppressed: 0 });
    expect(resolved).toMatchObject({ resolved: 1 });
    expect(stillResolved).toMatchObject({ resolved: 0 });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer test-token',
    });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-sg-idempotency-key': expect.stringContaining(':firing:warning:0'),
    });
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      'x-sg-idempotency-key': expect.stringContaining(':firing:critical:1'),
    });
    expect(await audit.listRecentByAction('platform.alert_delivery_evaluated', 10)).toHaveLength(3);
  });

  it('retries failed firing alerts on the shorter retry schedule', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { dispatcher } = createDispatcher(fetcher);

    const failed = await dispatcher.dispatch([warning], '2026-08-02T10:00:00.000Z');
    const coolingDown = await dispatcher.dispatch([warning], '2026-08-02T10:00:04.000Z');
    const retried = await dispatcher.dispatch([warning], '2026-08-02T10:00:05.000Z');

    expect(failed).toMatchObject({ failed: 1 });
    expect(coolingDown).toMatchObject({ suppressed: 1 });
    expect(retried).toMatchObject({ delivered: 1 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const failedKey = (fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>)[
      'x-sg-idempotency-key'
    ];
    const retryKey = (fetcher.mock.calls[1]?.[1]?.headers as Record<string, string>)[
      'x-sg-idempotency-key'
    ];
    expect(failedKey).toBe(retryKey);
  });

  it('retries a failed resolution once due and stops after successful delivery', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { dispatcher } = createDispatcher(fetcher);

    await dispatcher.dispatch([warning], '2026-08-02T10:00:00.000Z');
    const failed = await dispatcher.dispatch([], '2026-08-02T10:00:01.000Z');
    const waiting = await dispatcher.dispatch([], '2026-08-02T10:00:05.000Z');
    const retried = await dispatcher.dispatch([], '2026-08-02T10:00:06.000Z');
    const complete = await dispatcher.dispatch([], '2026-08-02T10:00:12.000Z');

    expect(failed).toMatchObject({ failed: 1, resolved: 0 });
    expect(waiting).toMatchObject({ failed: 0, resolved: 0 });
    expect(retried).toMatchObject({ failed: 0, resolved: 1 });
    expect(complete).toMatchObject({ failed: 0, resolved: 0 });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const failedRecoveryKey = (fetcher.mock.calls[1]?.[1]?.headers as Record<string, string>)[
      'x-sg-idempotency-key'
    ];
    const retriedRecoveryKey = (fetcher.mock.calls[2]?.[1]?.headers as Record<string, string>)[
      'x-sg-idempotency-key'
    ];
    expect(failedRecoveryKey).toBe(retriedRecoveryKey);
  });

  it('does not persist or deliver alerts when no channel is configured', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const dispatcher = new PlatformAlertDispatcher(
      new MockPlatformAlertStatesRepository(),
      new MockAuditRepository(),
      createDisabledObservability('worker'),
      {
        environment: 'test',
        cooldownMs: 60_000,
        retryMs: 5_000,
        timeoutMs: 1_000,
        webhookUrl: '',
        webhookBearerToken: '',
        slackWebhookUrl: '',
      },
      { info: vi.fn(), error: vi.fn() },
      fetcher,
    );

    await expect(dispatcher.dispatch([warning])).resolves.toMatchObject({
      configuredChannels: [],
      delivered: 0,
      suppressed: 0,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
