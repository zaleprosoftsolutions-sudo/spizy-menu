create table if not exists public.restaurant_staff_attendance (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid not null references public.restaurant_staffs(id) on delete cascade,
  attendance_date date not null default current_date,
  shift_name text not null default 'Morning',
  scheduled_start time,
  scheduled_end time,
  status text not null default 'scheduled',
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  break_minutes integer not null default 0,
  total_work_minutes integer not null default 0,
  notes text,
  is_deleted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_staff_attendance_status_check check (
    status in ('scheduled', 'present', 'late', 'half_day', 'absent', 'leave', 'off')
  ),
  constraint restaurant_staff_attendance_break_check check (break_minutes >= 0),
  constraint restaurant_staff_attendance_work_minutes_check check (total_work_minutes >= 0)
);

create index if not exists restaurant_staff_attendance_restaurant_date_idx
on public.restaurant_staff_attendance (restaurant_id, attendance_date desc, is_deleted);

create index if not exists restaurant_staff_attendance_staff_date_idx
on public.restaurant_staff_attendance (staff_id, attendance_date desc, is_deleted);

create unique index if not exists restaurant_staff_attendance_unique_shift_idx
on public.restaurant_staff_attendance (restaurant_id, staff_id, attendance_date, shift_name)
where is_deleted = false;

alter table public.restaurant_staff_attendance enable row level security;

drop policy if exists "Restaurant staff attendance member select" on public.restaurant_staff_attendance;
drop policy if exists "Restaurant staff attendance member insert" on public.restaurant_staff_attendance;
drop policy if exists "Restaurant staff attendance member update" on public.restaurant_staff_attendance;
drop policy if exists "Restaurant staff attendance member delete" on public.restaurant_staff_attendance;

create policy "Restaurant staff attendance member select"
on public.restaurant_staff_attendance
for select
to authenticated
using (
  is_deleted = false
  and (
    public.is_restaurant_member(restaurant_id)
    or public.get_my_role() = 'super_admin'
  )
);

create policy "Restaurant staff attendance member insert"
on public.restaurant_staff_attendance
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant staff attendance member update"
on public.restaurant_staff_attendance
for update
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
)
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant staff attendance member delete"
on public.restaurant_staff_attendance
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);
