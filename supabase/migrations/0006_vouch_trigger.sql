-- =============================================================
-- 0006 — vouch trigger + tightened RLS
-- =============================================================
-- 1) When an opposing-team member inserts a vouch row, automatically
--    flip the match's status to 'vouched' (or 'disputed') and timestamp it.
--    The existing matches_apply_stats trigger then propagates wins/losses
--    onto the player rows.
--
-- 2) Tighten the vouches INSERT RLS policy so the logger's PARTNER can't
--    vouch their own logger's match — only OPPOSING-team members count.
-- =============================================================

-- Trigger: vouches.insert → matches.status update
create or replace function public.handle_new_vouch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.action = 'vouched' then
    update public.matches
       set status = 'vouched',
           vouched_at = now()
     where id = new.match_id
       and status = 'pending';
  elsif new.action = 'disputed' then
    update public.matches
       set status = 'disputed'
     where id = new.match_id
       and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists on_vouch_inserted on public.vouches;
create trigger on_vouch_inserted
  after insert on public.vouches
  for each row execute function public.handle_new_vouch();

-- RLS: opposing-team-member-only vouching
drop policy if exists "vouches insert by opponent" on public.vouches;
create policy "vouches insert by opponent" on public.vouches
  for insert with check (
    exists (
      select 1
      from public.matches m
      join public.players p on p.auth_user_id = auth.uid()
      where m.id = match_id
        and player_id = p.id
        and p.is_guest = false
        and (
          -- Logger is on serving team → voucher must be on receiving team
          (m.logged_by in (m.server_team_p1, m.server_team_p2)
           and p.id in (m.receiver_team_p1, m.receiver_team_p2))
          or
          -- Logger is on receiving team → voucher must be on serving team
          (m.logged_by in (m.receiver_team_p1, m.receiver_team_p2)
           and p.id in (m.server_team_p1, m.server_team_p2))
        )
    )
  );

-- =============================================================
-- DONE.
-- =============================================================
