-- CebSpot review interaction updates
-- Run this in the Supabase SQL Editor after the base schema and gamification SQL.
-- It allows unrated reviews and makes helpful reactions reversible.

alter table public.reviews drop constraint if exists reviews_rating_check;
alter table public.reviews
  add constraint reviews_rating_check check (rating >= 0 and rating <= 5);

create or replace function public.mark_review_helpful(target_review_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  review_record public.reviews%rowtype;
  existing_vote public.review_helpful_votes%rowtype;
  created_vote public.review_helpful_votes%rowtype;
  spot_record public.spots%rowtype;
  voter_profile public.profiles%rowtype;
  voter_name text;
  reward_reference text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into review_record
  from public.reviews
  where id = target_review_id;

  if not found then
    raise exception 'Review not found.';
  end if;

  if review_record.user_id = current_user_id then
    raise exception 'You cannot mark your own review as helpful.';
  end if;

  select * into existing_vote
  from public.review_helpful_votes
  where review_id = target_review_id
    and user_id = current_user_id;

  if found then
    delete from public.review_helpful_votes where id = existing_vote.id;
    update public.reviews
    set likes_count = greatest(coalesce(likes_count, 0) - 1, 0), updated_at = now()
    where id = target_review_id;
    return jsonb_build_object('helpful', false, 'awarded', false);
  end if;

  insert into public.review_helpful_votes (review_id, user_id)
  values (target_review_id, current_user_id)
  on conflict do nothing
  returning * into created_vote;

  if created_vote.id is null then
    return jsonb_build_object('helpful', true, 'awarded', false);
  end if;

  update public.reviews
  set likes_count = coalesce(likes_count, 0) + 1, updated_at = now()
  where id = target_review_id;

  select * into voter_profile
  from public.profiles
  where id = current_user_id;

  voter_name := coalesce(
    nullif(trim(voter_profile.display_name), ''),
    split_part(voter_profile.email, '@', 1),
    'CebSpot user'
  );

  select * into spot_record
  from public.spots
  where id = review_record.spot_id;

  insert into public.activities (
    user_id,
    user_name,
    user_photo_url,
    action,
    target_id,
    target_name,
    type,
    content,
    spot_id,
    spot_name
  )
  values (
    review_record.user_id,
    voter_name,
    voter_profile.photo_url,
    'found your review helpful',
    target_review_id::text,
    coalesce(spot_record.name, 'Review'),
    'review_liked',
    voter_name || ' found your review helpful.',
    review_record.spot_id,
    coalesce(spot_record.name, 'CebSpot spot')
  );

  reward_reference := target_review_id::text || ':' || current_user_id::text;
  if not exists (
    select 1 from public.point_transactions
    where user_id = review_record.user_id
      and activity_type = 'REVIEW_MARKED_HELPFUL'
      and reference_type = 'review_helpful_vote'
      and reference_id = reward_reference
  ) then
    perform public.award_points(
      review_record.user_id,
      'REVIEW_MARKED_HELPFUL',
      2,
      reward_reference,
      'review_helpful_vote',
      jsonb_build_object('review_id', target_review_id, 'voter_id', current_user_id),
      true
    );
  end if;

  return jsonb_build_object('helpful', true, 'awarded', true);
end;
$$;

revoke all on function public.mark_review_helpful(uuid) from public;
grant execute on function public.mark_review_helpful(uuid) to authenticated;

create or replace function public.add_review_reply(
  target_review_id uuid,
  target_spot_id uuid,
  reply_body text,
  parent_reply_id uuid default null
)
returns public.review_replies
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_body text := trim(coalesce(reply_body, ''));
  review_record public.reviews%rowtype;
  reviewer_profile public.profiles%rowtype;
  created_reply public.review_replies%rowtype;
  spot_record public.spots%rowtype;
  commenter_name text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to comment.';
  end if;

  if normalized_body = '' then
    raise exception 'Write a comment before sending.';
  end if;

  if char_length(normalized_body) > 500 then
    raise exception 'Comments can contain up to 500 characters.';
  end if;

  select * into review_record
  from public.reviews
  where id = target_review_id;

  if not found or review_record.spot_id <> target_spot_id then
    raise exception 'Review not found.';
  end if;

  if parent_reply_id is not null and not exists (
    select 1 from public.review_replies parent_reply
    where parent_reply.id = add_review_reply.parent_reply_id
      and parent_reply.review_id = target_review_id
  ) then
    raise exception 'Comment thread target not found.';
  end if;

  select * into reviewer_profile
  from public.profiles
  where id = current_user_id;

  if not found then
    raise exception 'Your profile is unavailable.';
  end if;

  commenter_name := coalesce(
    nullif(trim(reviewer_profile.display_name), ''),
    split_part(reviewer_profile.email, '@', 1),
    'CebSpot user'
  );

  insert into public.review_replies (
    spot_id,
    review_id,
    parent_reply_id,
    user_id,
    user_name,
    user_photo_url,
    body
  )
  values (
    target_spot_id,
    target_review_id,
    add_review_reply.parent_reply_id,
    current_user_id,
    commenter_name,
    reviewer_profile.photo_url,
    normalized_body
  )
  returning * into created_reply;

  select * into spot_record
  from public.spots
  where id = target_spot_id;

  if review_record.user_id <> current_user_id then
    insert into public.activities (
      user_id,
      user_name,
      user_photo_url,
      action,
      target_id,
      target_name,
      type,
      content,
      spot_id,
      spot_name
    )
    values (
      review_record.user_id,
      commenter_name,
      reviewer_profile.photo_url,
      'commented on your review',
      target_review_id::text,
      coalesce(spot_record.name, 'Review'),
      'review_comment',
      commenter_name || ' commented on your review.',
      target_spot_id,
      coalesce(spot_record.name, 'CebSpot spot')
    );
  end if;

  return created_reply;
end;
$$;

revoke all on function public.add_review_reply(uuid, uuid, text, uuid) from public;
grant execute on function public.add_review_reply(uuid, uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
