export function paymentSnapshot(resource: Record<string, any>) {
  // Persist only the fields required for financial validation, never provider
  // billing details, card data, or arbitrary webhook contents.
  const attrs = resource?.attributes ?? {};
  return { id: resource?.id, attributes: {
    livemode: attrs.livemode, reference_number: attrs.reference_number, metadata: attrs.metadata,
    checkout_url: attrs.checkout_url, status: attrs.status,
    line_items: Array.isArray(attrs.line_items) ? attrs.line_items.map((item: any) => ({ amount: item.amount, currency: item.currency, quantity: item.quantity })) : [],
    payments: Array.isArray(attrs.payments) ? attrs.payments.map((payment: any) => ({ id: payment.id, attributes: {
      amount: payment.attributes?.amount, currency: payment.attributes?.currency, status: payment.attributes?.status,
      livemode: payment.attributes?.livemode, payment_intent_id: payment.attributes?.payment_intent_id,
    } })) : [],
  } };
}
