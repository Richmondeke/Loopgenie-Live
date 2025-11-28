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
| `updated_at` | Timestamptz | `now()` | |

### RLS Policies for Profiles
1. **Enable RLS**
2. **Policy "Users can view own profile":**
   - Operation: SELECT
   - Using: `auth.uid() = id`
3. **Policy "Users can update own profile":**
   - Operation: UPDATE
   - Using: `auth.uid() = id`

---

## 2. Projects Table
**Name:** `projects`  
**Description:** Stores generated video projects.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | Text | - | **Primary Key**. (HeyGen Job IDs are strings) |
| `user_id` | UUID | `auth.uid()` | Foreign Key to `auth.users.id` |
| `template_id` | Text | - | **Required** |
| `template_name` | Text | - | |
| `thumbnail_url` | Text | - | |
| `video_url` | Text | - | |
| `status` | Text | `'pending'` | Values: 'pending', 'processing', 'completed', 'failed' |
| `error` | Text | - | |
| `created_at` | Int8 | - | Stores `Date.now()` timestamp |
| `project_type` | Text | `'AVATAR'` | Values: 'AVATAR', 'UGC_PRODUCT' |

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

---

## 3. Auto-Create Profile Trigger (SQL Only)
To automatically create a profile row with 5 credits when a user signs up, you must run this SQL in the SQL Editor, as the Table Editor cannot create triggers easily.

```sql
create function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, credits_balance)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 5);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```
