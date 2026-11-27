-- Record actual approval transitions without inventing dates for older posts.
alter table public.spot_submissions add column if not exists approved_at timestamptz;

create or replace function public.record_spot_submission_approval_time()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'approved' then
    if tg_op = 'INSERT' then
      new.approved_at := statement_timestamp();
    elsif old.status is distinct from 'approved' then
      new.approved_at := statement_timestamp();
    else
      -- Editing another field cannot move an old approval to the top.
      new.approved_at := old.approved_at;
    end if;
  else
    new.approved_at := null;
  end if;
  return new;
end;
$$;

create trigger spot_submission_approval_time
before insert or update on public.spot_submissions
for each row execute function public.record_spot_submission_approval_time();

create index if not exists spot_submissions_approval_history_idx
on public.spot_submissions (status, approved_at desc nulls last, created_at desc, id);

comment on column public.spot_submissions.approved_at is
  'Server-recorded most recent transition to approved. NULL for historical approvals whose time was not recorded.';
