// ---------------------------------------------------------------------------
// Billing API client (Stripe checkout)
// ---------------------------------------------------------------------------

export interface CheckoutResponse {
  url: string;
}

async function billingFetch<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new Error(`Network error: ${String((err as { message?: string })?.message ?? err)}`);
  }

  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const json = await res.json();
      if (json && typeof json === 'object' && 'error' in json) msg = String(json.error);
    } catch {
      // ignore parse errors
    }
    throw new Error(msg);
  }

  return (await res.json()) as T;
}

export async function createCheckoutSession(
  token: string,
  plan: 'premium' | 'enterprise' = 'premium'
): Promise<CheckoutResponse> {
  return billingFetch<CheckoutResponse>('/api/billing/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan }),
  });
}

/** Inicia checkout para compra de créditos extras (pacote de 5 créditos). */
export async function createCreditsCheckoutSession(token: string): Promise<CheckoutResponse> {
  return billingFetch<CheckoutResponse>('/api/billing/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ type: 'credits', amount: 5 }),
  });
}
