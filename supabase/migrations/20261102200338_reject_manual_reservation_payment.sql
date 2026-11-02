begin;

-- Focused, additive owner decision boundary. Never changes existing records
-- during installation and never modifies approval/account/privacy functions.
create or replace function public.reject_manual_reservation_payment(reservation_id uuid)
returns public.reservations language plpgsql security definer set search_path='' as $$
declare r public.reservations%rowtype; venue_id uuid;
  rejection_reason constant text := 'Manual GCash payment proof rejected by the venue: the photo and reference could not be verified.';
begin
  perform public.require_active_account();
  if auth.uid() is null or not public.account_is_active(auth.uid())
    or not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null) then
    raise exception 'An active confirmed account is required.' using errcode='42501';
  end if;
  select spot_id into venue_id from public.reservations where id=reservation_id;
  if not exists(select 1 from public.spots s where s.id=venue_id and
    (s.owner_id=auth.uid() or public.is_current_user_admin() or exists(
      select 1 from public.owner_spot_access a where a.spot_id=s.id and a.owner_id=auth.uid()))) then
    raise exception 'Only the assigned venue owner or administrator can reject payment proof.' using errcode='42501';
  end if;
  -- Same venue-first order as approval, hold expiry and checkout allocation.
  perform 1 from public.spots where id=venue_id for update;
  select * into r from public.reservations where id=reservation_id for update;
  if r.payment_method is distinct from 'gcash' or r.payment_required is distinct from true
    or r.proof_submitted_at is null or nullif(trim(r.payment_proof_url),'') is null
    or nullif(trim(r.payment_reference),'') is null or r.paid_at is not null or r.approved_by is not null
    or r.financial_resolution='resolution_required' or r.payment_status in ('paid','refund_pending')
    or r.refund_status in ('pending_review','approved')
    or exists(select 1 from public.reservation_payments p where p.reservation_id=r.id) then
    raise exception 'Only unpaid manual GCash proof can be rejected. Refresh the reservation.' using errcode='55000';
  end if;
  -- A lost response can be retried without cancelling twice or notifying twice.
  if r.status='cancelled' and r.payment_status='failed' and r.cancellation_reason=rejection_reason then return r; end if;
  if coalesce(r.status,'') not in ('pending','pending_payment','rescheduled')
    or coalesce(r.payment_status,'') not in ('pending','unpaid','failed')
    or r.hold_expires_at is null or r.hold_expires_at<=now() then
    raise exception 'Manual payment review expired or was already resolved. Refresh the reservation.' using errcode='55000';
  end if;
  update public.reservations set status='cancelled',payment_status='failed',
    cancellation_reason=rejection_reason,cancelled_at=now(),hold_expires_at=null,
    refund_status='not_applicable',updated_at=now() where id=r.id returning * into r;
  insert into public.activities(user_id,user_name,action,target_id,target_name,type,content,spot_id,spot_name)
    values(r.user_id,'CebSpot','rejected your manual GCash payment',r.id::text,r.spot_name,
      'reservation_cancelled','The venue could not verify your GCash payment photo and reference. Your reservation was cancelled and the table released. Contact the venue if you believe this is a mistake.',r.spot_id,r.spot_name);
  return r;
end;
$$;
revoke all on function public.reject_manual_reservation_payment(uuid) from public,anon;
grant execute on function public.reject_manual_reservation_payment(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
