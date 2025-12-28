
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
| `webhook_url` | Text | - | URL for automation dispatch |
| `webhook_method` | Text | `'POST'` | HTTP method for webhook |
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
4. **Policy "Admins can view all profiles":**
   - Operation: SELECT
   - Using: `public.check_is_admin() = true` 

---

## 2. Projects Table
**Name:** `projects`  
**Description:** Stores generated video projects.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | Text | - | **Primary Key**. (HeyGen Job IDs are strings) |
| `user_id` | UUID | `auth.uid()` | Foreign Key to `profiles.id` |
| `template_id` | Text | - | **Required** |
| `template_name` | Text | - | |
| `thumbnail_url` | Text | - | |
| `video_url` | Text | - | |
| `status` | Text | `'pending'` | Values: 'pending', 'processing', 'completed', 'failed' |
| `error` | Text | - | |
| `created_at` | Int8 | - | Stores `Date.now()` timestamp |
| `project_type` | Text | `'AVATAR'` | Values: 'AVATAR', 'UGC_PRODUCT', 'SHORTS', etc. |
| `cost` | Integer | `1` | Credits consumed by this project |
| `metadata` | Jsonb | - | Stores scene data and AI manifest |

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
5. **Policy "Admins can view all projects":**
   - Operation: SELECT
   - Using: `public.check_is_admin() = true`

---

## 🚨 Emergency Fix: Missing Columns (profiles.webhook_url, etc)
**If you see errors about missing columns in the profiles table, run this:**

```sql
-- 1. Add Webhook Columns to Profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS webhook_url TEXT,
ADD COLUMN IF NOT EXISTS webhook_method TEXT DEFAULT 'POST';

-- 2. Add Metadata Column to Projects (if missing)
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 3. CRITICAL: Refresh schema cache
-- Run this if the columns exist but the app says they "cannot be found"
NOTIFY pgrst, 'reload schema';
```

---

## 🚨 Emergency Fix: Missing 'cost' Column
**If you get "Could not find the 'cost' column" error, run this:**

```sql
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS cost INTEGER DEFAULT 1;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
```

---

## 🚨 Emergency Fix: Infinite Recursion (Error 42P17)
**Run this SCRIPT if you see "infinite recursion detected in policy" errors.**

```sql
-- 1. Create a Secure Function to check Admin Status
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
