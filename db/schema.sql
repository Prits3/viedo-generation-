-- Signup waitlist. The app creates this automatically on first write,
-- but you can run it by hand in the Supabase SQL editor if you prefer.
create table if not exists signups (
  id         bigserial primary key,
  email      text not null unique,
  source     text,
  created_at timestamptz not null default now()
);
