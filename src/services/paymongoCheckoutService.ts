import { supabase } from '../lib/supabase';

export interface PaymongoCheckout {
  checkoutUrl: string;
  checkoutSessionId: string;
  amount: number;
  currency: string;
}

type CheckoutInput = {
  reservationId: string;
  successUrl?: string;
  cancelUrl?: string;
};

async function getFunctionErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'PayMongo checkout request failed.';
  const maybeError = error as {
    message?: string;
    context?: Response | { json?: () => Promise<unknown>; text?: () => Promise<string> };
  };

  if (maybeError.context?.json) {
    try {
      const payload = await maybeError.context.json();
      if (payload && typeof payload === 'object') {
        const message = (payload as { error?: unknown; message?: unknown }).error ?? (payload as { message?: unknown }).message;
        if (typeof message === 'string' && message) return message;
      }
    } catch {
      // The response body may already be consumed; try text below.
    }
  }

  if (maybeError.context?.text) {
    try {
      const text = await maybeError.context.text();
      if (text) return text;
    } catch {
      // Fall through to the Supabase client error message.
    }
  }

  return maybeError.message ?? 'PayMongo checkout request failed.';
}

async function createCheckout(method: 'gcash' | 'qrph', input: CheckoutInput): Promise<PaymongoCheckout> {
  const { data, error } = await supabase.functions.invoke(`paymongo-create-${method}-checkout`, {
    body: input,
  });

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (!data?.checkoutUrl || !data?.checkoutSessionId) {
    throw new Error('PayMongo did not return a checkout URL.');
  }

  return data as PaymongoCheckout;
}

export const paymongoCheckoutService = {
  async createGcashCheckout(input: CheckoutInput): Promise<PaymongoCheckout> {
    return createCheckout('gcash', input);
  },

  async createQrphCheckout(input: CheckoutInput): Promise<PaymongoCheckout> {
    return createCheckout('qrph', input);
  },
};
