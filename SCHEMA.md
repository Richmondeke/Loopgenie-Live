
# Database Schema Setup

If you prefer to set up your Supabase database manually using the Table Editor, follow these specifications.

## 1. Profiles Table
**Name:** `profiles`  
**Description:** Stores user profile info and credits.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | UUID | - | **Primary Key**. Link to `auth.users` |
| `email` | Text | - | |
| `full_name` | Text | - | |
| `credits_balance` | Integer | `5` | The number of free credits available. |
| `is_admin` | Boolean | `false` | Set to `true` for admin users. |
| `created_at` | Timestamptz | `now()` | |
| `updated_at` | Timestamptz | `now()` | |

### RLS Policies for Profiles
1. **Enable RLS**
2. **Policy "Users can view own profile":**
   - Operation: SELECT
   - Using: `auth.uid() = id`
3. **Policy "Users can update own profile":**
   - Operation: UPDATE
   - Using: `auth.uid() = id`
4. **Policy "Admins can view all profiles" (NEW):**
   - Operation: SELECT
   - Using: `public.check_is_admin() = true` (Must use function to avoid recursion)

---

## 2. Projects Table
**Name:** `projects`  
**Description:** Stores generated video projects.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | Text | - | **Primary Key**. (HeyGen Job IDs are strings) |
| `user_id` | UUID | `auth.uid()` | Foreign Key to `profiles.id` (Required for Admin Dashboard) |
| `template_id` | Text | - | **Required** |
| `template_name` | Text | - | |
| `thumbnail_url` | Text | - | |
| `video_url` | Text | - | |
| `status` | Text | `'pending'` | Values: 'pending', 'processing', 'completed', 'failed' |
| `error` | Text | - | |
| `created_at` | Int8 | - | Stores `Date.now()` timestamp |
| `project_type` | Text | `'AVATAR'` | Values: 'AVATAR', 'UGC_PRODUCT', 'SHORTS', etc. |
| `cost` | Integer | `1` | Credits consumed by this project |

### RLS Policies for Projects
1. **Enable RLS**
2. **Policy "Users can view own projects":**
   - Operation: SELECT
   - Using: `auth.uid() = user_id`
3. **Policy "Users can insert own projects":**
   - Operation: INSERT
   - With Check: `auth.uid() = user_id`
4. **Policy "Users can update own projects":**
   - Operation: UPDATE
   - Using: `auth.uid() = user_id`
5. **Policy "Admins can view all projects" (NEW):**
   - Operation: SELECT
   - Using: `public.check_is_admin() = true`

---

## 3. 🚨 Emergency Fix: Missing 'cost' Column
**If you get "Could not find the 'cost' column" error, run this:**

```sql
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS cost INTEGER DEFAULT 1;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
```

---

## 4. 🚨 Emergency Fix: Infinite Recursion (Error 42P17)
**Run this SCRIPT if you see "infinite recursion detected in policy" errors.**

```sql
-- 1. Create a Secure Function to check Admin Status
-- This function bypasses RLS (SECURITY DEFINER) to safely check the table without looping.
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop the Broken Recursive Policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all projects" ON public.projects;

-- 3. Re-create Policies using the Safe Function
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING ( public.check_is_admin() = true );

CREATE POLICY "Admins can view all projects"
ON public.projects
FOR SELECT
USING ( public.check_is_admin() = true );
```

---

## 5. "Fix Everything" / Full Setup Script
**Run this to fully reset/setup the database with correct structure.**

```sql
-- 1. Create/Update Profiles Table
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  full_name text,
  credits_balance int default 5,
  is_admin boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ensure columns exist
alter table public.profiles add column if not exists is_admin boolean default false;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists created_at timestamptz default now();

-- 2. Create Projects Table
create table if not exists public.projects (
  id text primary key,
  user_id uuid references public.profiles(id) not null,
  template_id text not null,
  template_name text,
  thumbnail_url text,
  video_url text,
  status text default 'pending',
  error text,
  created_at bigint,
  project_type text default 'AVATAR',
  cost int default 1
);

-- Ensure columns exist
alter table public.projects add column if not exists cost int default 1;

-- 3. Enable RLS
alter table public.profiles enable row level security;
alter table public.projects enable row level security;

-- 4. Basic User Policies
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

drop policy if exists "Users can view own projects" on public.projects;
create policy "Users can view own projects" on public.projects for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own projects" on public.projects;
create policy "Users can insert own projects" on public.projects for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own projects" on public.projects;
create policy "Users can update own projects" on public.projects for update using (auth.uid() = user_id);

-- 5. ADMIN SETUP (With Recursion Fix)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles" on public.profiles for select 
using ( public.check_is_admin() = true );

drop policy if exists "Admins can view all projects" on public.projects;
create policy "Admins can view all projects" on public.projects for select 
using ( public.check_is_admin() = true );

-- 6. Trigger to create profile on signup
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, credits_balance)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 5)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 7. REPAIR: Backfill missing profiles
insert into public.profiles (id, email, full_name, credits_balance)
select 
  id, 
  email, 
  raw_user_meta_data->>'full_name', 
  5
from auth.users
on conflict (id) do nothing;

-- 8. REPAIR: Enforce Foreign Key
delete from public.projects where user_id not in (select id from public.profiles);
alter table public.projects drop constraint if exists fk_projects_profiles;
alter table public.projects
add constraint fk_projects_profiles
foreign key (user_id) 
references public.profiles (id)
on delete cascade;

-- 9. PROMOTE ADMIN
-- Replace with your email if needed
update public.profiles
set is_admin = true
where email = 'richmondeke@gmail.com';
