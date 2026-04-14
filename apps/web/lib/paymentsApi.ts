import { API_BASE_URL } from './api';

export type PaymentCheckoutPlan = 'pro' | 'team';

type PaymentApiResponse = {
  url?: string;
  error?: string;
  plan?: string;
};

async function parsePaymentResponse(response: Response): Promise<PaymentApiResponse | null> {
  try {
    return (await response.json()) as PaymentApiResponse;
  } catch {
    return null;
  }
}

export async function createCheckoutSession(
  accessToken: string,
  userId: string,
  plan: PaymentCheckoutPlan,
) {
  const response = await fetch(`${API_BASE_URL}/v1/payments/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ userId, plan }),
  });

  return {
    status: response.status,
    data: await parsePaymentResponse(response),
  };
}

export async function createBillingPortalSession(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/v1/payments/portal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });

  return {
    status: response.status,
    data: await parsePaymentResponse(response),
  };
}

export function paymentErrorMessage(input: {
  context: 'checkout' | 'portal';
  response: PaymentApiResponse | null;
}): string {
  if (!input.response?.error) {
    return input.context === 'checkout' ? '结账会话创建失败。' : '账单入口打开失败。';
  }

  if (input.response.error === 'stripe_not_configured') {
    return input.context === 'checkout'
      ? 'Stripe 当前未配置，本地环境暂时无法创建结账会话。'
      : 'Stripe 当前未配置，本地环境暂时无法打开账单入口。';
  }

  if (input.response.error === 'stripe_price_not_configured') {
    return input.response.plan === 'team' ? 'Team 套餐价格尚未配置。' : 'Pro 套餐价格尚未配置。';
  }

  if (input.response.error === 'billing_portal_unavailable') {
    return '当前账户还没有可用的 Stripe customer，暂时无法打开账单入口。';
  }

  return input.context === 'checkout'
    ? `结账会话创建失败：${input.response.error}`
    : `账单入口打开失败：${input.response.error}`;
}

export function isPaymentUrlResponse(
  response: PaymentApiResponse | null,
): response is PaymentApiResponse & { url: string } {
  return typeof response?.url === 'string' && response.url.length > 0;
}
