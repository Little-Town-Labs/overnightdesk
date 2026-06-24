-- Feature 002 Daily Call Queue verification contract
-- Run against tenet0 / trevor after local validation or production sync.

\echo 'daily_call_queue: baseline counts'
select 'prospects' as check_name, count(*) as count from trevor.prospects;
select 'call_tasks' as check_name, count(*) as count from trevor.call_tasks;

\echo 'daily_call_queue: DNC prospects must not have open callable tasks'
select count(*) as dnc_open_call_tasks
from trevor.call_tasks t
join trevor.prospects p on p.id = t.prospect_id
where t.task_type = 'call'
  and t.status = 'open'
  and p.do_not_contact = true;

\echo 'daily_call_queue: duplicate open call tasks by prospect and due day'
select prospect_id, due_at::date as due_day, count(*) as open_task_count
from trevor.call_tasks
where task_type = 'call'
  and status = 'open'
group by prospect_id, due_at::date
having count(*) > 1;

\echo 'daily_call_queue: ranked due prospects preview'
select id, priority, next_action_at, status, do_not_contact
from trevor.prospects
where coalesce(do_not_contact, false) = false
order by
  case when next_action_at is not null and next_action_at <= now() then 1 else 0 end desc,
  priority desc,
  next_action_at asc nulls last,
  updated_at desc,
  id asc
limit 10;

\echo 'daily_call_queue: queue generation must not create interactions or drafts by itself'
select 'interactions' as check_name, count(*) as count from trevor.interactions;
select 'followup_drafts' as check_name, count(*) as count from trevor.followup_drafts;
