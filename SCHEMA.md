
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

## 3. Social Integrations Table (NEW)
**Name:** `social_integrations`
**Description:** Stores OAuth tokens or connection status for social platforms.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | UUID | `gen_random_uuid()` | **Primary Key** |
| `user_id` | UUID | `auth.uid()` | Foreign Key to `profiles.id` |
| `platform` | Text | - | 'twitter', 'linkedin', 'instagram' |
| `access_token` | Text | - | Encrypted token (simulated for now) |
| `username` | Text | - | Display name |
| `avatar_url` | Text | - | Profile picture URL |
| `connected` | Boolean | `true` | |
| `created_at` | Timestamptz | `now()` | |

**Constraint:**
You MUST add a unique constraint on `(user_id, platform)` so you can connect/disconnect easily.
```sql
ALTER TABLE social_integrations ADD CONSTRAINT social_integrations_user_platform_key UNIQUE (user_id, platform);
```

### RLS Policies for Social Integrations
1. **Enable RLS**
2. **Policy "Users can manage own integrations":**
   - Operation: ALL
   - Using: `auth.uid() = user_id`

---

## 4. Social Posts Table (NEW)
**Name:** `social_posts`
**Description:** Stores scheduled and posted content.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | Text | - | **Primary Key** (string format) |
| `user_id` | UUID | `auth.uid()` | Foreign Key to `profiles.id` |
| `content` | Text | - | |
| `platform` | Text | - | |
| `scheduled_at` | Int8 | - | Timestamp |
| `status` | Text | `'scheduled'` | 'scheduled', 'posted', 'failed' |
| `created_at` | Timestamptz | `now()` | |
| `media_url` | Text | - | Optional URL to media |

### RLS Policies for Social Posts
1. **Enable RLS**
2. **Policy "Users can manage own posts":**
   - Operation: ALL
   - Using: `auth.uid() = user_id`

---

## 5. 🚨 Emergency Fix: Missing 'cost' Column
**If you get "Could not find the 'cost' column" error, run this:**

```sql
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS cost INTEGER DEFAULT 1;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
```

---

## 6. 🚨 Emergency Fix: Infinite Recursion (Error 42P17)
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

## 7. 📦 Storage Setup (Run this to fix 42710 Error)
**Creates the storage bucket for permanent video files.**

```sql
-- 1. Reset the bucket (Safe: keeps files, resets config)
update storage.buckets
set public = true, file_size_limit = 52428800 -- Limit to 50MB
where id = 'assets';

-- If bucket doesn't exist, create it
insert into storage.buckets (id, name, public, file_size_limit)
values ('assets', 'assets', true, 52428800)
on conflict (id) do update set public = true;

-- 2. Drop Old Policies (Clean Slate)
drop policy if exists "Users can upload their own assets" on storage.objects;
drop policy if exists "Public Access to Assets" on storage.objects;
drop policy if exists "Authenticated users can upload" on storage.objects;
drop policy if exists "Public read access" on storage.objects;

-- 3. Create Robust Policies
-- Allow Read: Anyone can view files (Public Bucket)
create policy "Public read access"
on storage.objects for select
using ( bucket_id = 'assets' );

-- Allow Upload: User can only upload to folder matching their User ID
create policy "Authenticated users can upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'assets' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```
