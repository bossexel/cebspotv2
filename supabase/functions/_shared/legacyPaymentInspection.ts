// Read-only classification of old checkout sessions. Never creates, expires,
// refunds or updates a payment. Provider/customer data never enters the report.
type Row = Record<string, any>;
export function recordedPaymentMode(row: Row) {
  const raw=row.raw_payload ?? {};
  return raw.data?.attributes?.livemode ?? raw.attributes?.livemode ?? raw.livemode;
}

export function classifyLegacySession(row: Row, session: any) {
  const attrs=session?.attributes;
  if(session?.id!==row.provider_checkout_session_id || session?.type!=='checkout_session'
    || attrs?.reference_number!==row.reservation_id
    || attrs?.metadata?.reservation_id!==row.reservation_id)return 'referenceMismatch';
  if(attrs.livemode!==false)return 'modeMismatch';
  const amount=Number(row.amount)*100;
  const items=attrs.line_items;
  if(row.currency!=='PHP' || !Number.isSafeInteger(amount) || amount<=0 || !Array.isArray(items) || items.length!==1
    || items[0]?.currency!=='PHP' || items[0]?.amount!==amount || items[0]?.quantity!==1)return 'amountOrCurrencyMismatch';
  if(!Array.isArray(attrs.payments))return 'unexpectedStatus';
  const paid=attrs.payments.filter((p: Row)=>p?.attributes?.status==='paid');
  if(paid.length>1)return 'unexpectedStatus';
  if(paid.length===1){
    const payment=paid[0];
    if(payment.attributes.livemode!==false)return 'modeMismatch';
    if(payment.attributes.amount!==amount || payment.attributes.currency!=='PHP')return 'amountOrCurrencyMismatch';
    if(!/^pay_[A-Za-z0-9_]+$/.test(payment.id ?? ''))return 'referenceMismatch';
    return 'paidMatching';
  }
  if(attrs.status==='expired')return 'expired';
  if(attrs.status==='active' || attrs.status==='awaiting_payment')return 'unpaidOpen';
  return 'unexpectedStatus';
}

export function legacyReconciliationSnapshot(session: any) {
  const a=session.attributes;
  return {id:session.id,type:session.type,attributes:{livemode:a.livemode,reference_number:a.reference_number,
    metadata:{reservation_id:a.metadata?.reservation_id,...(a.metadata?.checkout_attempt_id?{checkout_attempt_id:a.metadata.checkout_attempt_id}:{})},
    status:a.status,line_items:a.line_items.map((i: Row)=>({amount:i.amount,currency:i.currency,quantity:i.quantity})),
    payments:a.payments.map((p: Row)=>({id:p.id,attributes:{status:p.attributes?.status,amount:p.attributes?.amount,
      currency:p.attributes?.currency,livemode:p.attributes?.livemode,payment_intent_id:p.attributes?.payment_intent_id}}))}};
}

export async function inspectLegacyTestPayments(rows: Row[], retrieve: (id: string) => Promise<any>, offset=0) {
  const candidates: Row[]=[];
  const scope={pendingRows:rows.length,testCheckoutCandidates:0,liveModeSkipped:0,unknownModeSkipped:0,unsupportedSessionSkipped:0,durableRequestsSkipped:0};
  for(const row of rows){
    const mode=recordedPaymentMode(row);
    if(mode===true){scope.liveModeSkipped++;continue;}
    if(mode!==false){scope.unknownModeSkipped++;continue;}
    if(row.checkout_request!=null){scope.durableRequestsSkipped++;continue;}
    if(!/^cs_[A-Za-z0-9_]+$/.test(row.provider_checkout_session_id ?? '')){scope.unsupportedSessionSkipped++;continue;}
    candidates.push(row);
  }
  scope.testCheckoutCandidates=candidates.length;
  const checks={paidMatching:0,unpaidOpen:0,expired:0,referenceMismatch:0,amountOrCurrencyMismatch:0,modeMismatch:0,unexpectedStatus:0,cannotVerify:0};
  const batch=candidates.slice(offset,offset+5);
  for(const row of batch){
    let session;
    try{session=await retrieve(row.provider_checkout_session_id);}catch{checks.cannotVerify++;continue;}
    checks[classifyLegacySession(row,session)]++;
  }
  return {readOnly:true,scope,offset,checked:batch.length,nextOffset:offset+batch.length<candidates.length?offset+batch.length:null,checks};
}
