const {test}=require('node:test');const assert=require('node:assert/strict');const {createHash,createHmac,webcrypto}=require('node:crypto');const load=require('./load-client.cjs');
const {authenticatePaymentWorker}=load('supabase/functions/_shared/paymentWorkerAuth.ts',{'./paymentSignature.ts':{sha256:async value=>createHash('sha256').update(value).digest('hex')}},{crypto:webcrypto});
const token='synthetic-private-worker-token-of-at-least-32-characters';const now=Date.now();const minute=Math.floor(now/60000);
const signed=(m=minute,purpose='cebspot-payment-maintenance',key=token)=>`Maintenance-HMAC ${m}.`+createHmac('sha256',key).update(`${purpose}:${m}`).digest('hex');
test('scheduled authentication accepts only fresh signatures bound to payment maintenance and does not queue a reusable token',async()=>{
  const header=signed();assert.equal(header.includes(token),false);const result=await authenticatePaymentWorker(header,token,now);assert.equal(result.mode,'scheduled');assert.equal(result.minute,minute);
  for(const header of [signed(minute-2),signed(minute+2),signed(minute,'another-function'),signed(minute,'cebspot-payment-maintenance','another-key'),'', 'Maintenance-HMAC '+minute+'.invalid'])assert.equal(await authenticatePaymentWorker(header,token,now),null);
});
test('the operator bearer credential remains private and mandatory when the signed scheduler scheme is not used',async()=>{
  assert.equal((await authenticatePaymentWorker('Bearer '+token,token,now)).mode,'operator');assert.equal(await authenticatePaymentWorker('Bearer wrong',token,now),null);assert.equal(await authenticatePaymentWorker(signed(),'short',now),null);
});
