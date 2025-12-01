
# Database Schema Setup

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
**Description:** Stores connected social accounts.

```sql
CREATE TABLE IF NOT EXISTS public.social_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  platform TEXT NOT NULL,
  username TEXT,
  avatar_url TEXT,
  connected BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform) -- Prevents duplicates
);

ALTER TABLE public.social_integrations ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if any to avoid conflicts during testing
DROP POLICY IF EXISTS "Users can manage their own integrations" ON public.social_integrations;

CREATE POLICY "Users can manage their own integrations" 
ON public.social_integrations FOR ALL 
USING (auth.uid() = user_id);
```

---

## 4. Social Posts Table (NEW)
**Name:** `social_posts`
**Description:** Stores history of posts.

```sql
CREATE TABLE IF NOT EXISTS public.social_posts (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  content TEXT,
  platform TEXT,
  scheduled_at BIGINT,
  status TEXT DEFAULT 'posted',
  media_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if any
DROP POLICY IF EXISTS "Users can manage their own posts" ON public.social_posts;

CREATE POLICY "Users can manage their own posts" 
ON public.social_posts FOR ALL 
USING (auth.uid() = user_id);
```

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
