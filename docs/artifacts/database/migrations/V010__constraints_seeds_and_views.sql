alter table calendar_workout_events
  add constraint chk_calendar_event_dates_nonnegative_duration check (duration_minutes is null or duration_minutes >= 0);

alter table training_calendar_blocks
  add constraint chk_calendar_block_dates check (end_date >= start_date);

alter table meal_plans
  add constraint chk_meal_plan_dates check (end_date >= start_date);

alter table invoices
  add constraint chk_invoice_dates check (due_date >= issue_date),
  add constraint chk_invoice_total_nonnegative check (total_amount >= 0);

alter table payments
  add constraint chk_payments_amount_positive check (amount > 0);

alter table trainer_client_metrics_snapshots
  add constraint uq_trainer_client_snapshot unique (trainer_user_id, client_user_id, snapshot_date);

insert into roles (code, description) values
  ('trainee', 'Standard trainee account'),
  ('coach', 'Human trainer or coach account'),
  ('gym_partner', 'Gym partner operations account'),
  ('admin', 'Platform administrator'),
  ('support_ops', 'Support and operations account')
on conflict (code) do nothing;

insert into dietary_preferences (code, label) values
  ('high_protein', 'High Protein'),
  ('vegetarian', 'Vegetarian'),
  ('vegan', 'Vegan'),
  ('gluten_free', 'Gluten Free'),
  ('dairy_free', 'Dairy Free')
on conflict (code) do nothing;

insert into health_conditions (code, label) values
  ('hypertension', 'Hypertension'),
  ('diabetes_type_2', 'Type 2 Diabetes'),
  ('pcos', 'PCOS'),
  ('knee_pain', 'Knee Pain'),
  ('low_back_pain', 'Low Back Pain')
on conflict (code) do nothing;

insert into muscle_groups (code, label) values
  ('chest', 'Chest'),
  ('back', 'Back'),
  ('legs', 'Legs'),
  ('shoulders', 'Shoulders'),
  ('arms', 'Arms'),
  ('core', 'Core')
on conflict (code) do nothing;

create view trainer_open_invoices_v as
select
  i.id,
  i.trainer_user_id,
  i.client_user_id,
  i.invoice_number,
  i.issue_date,
  i.due_date,
  i.total_amount,
  i.status
from invoices i
where i.status in ('sent', 'overdue', 'final_notice');

create view trainee_today_workout_v as
select
  cwe.user_id,
  cwe.event_date,
  cwe.scheduled_start_time,
  cwe.status,
  w.id as workout_id,
  w.title,
  w.workout_type,
  w.estimated_duration_minutes
from calendar_workout_events cwe
left join workouts w on w.id = cwe.workout_id
where cwe.event_date = current_date;
