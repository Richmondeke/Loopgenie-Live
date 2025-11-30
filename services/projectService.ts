
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { Project, ProjectStatus } from '../types';

// --- Types ---
const mapRowToProject = (row: any): Project => {
  let pType = row.project_type;

  if (!pType) {
    const idStr = String(row.id || '');
    if (idStr.startsWith('ugc_')) pType = 'UGC_PRODUCT';
    else if (idStr.startsWith('stor_')) pType = 'STORYBOOK';
    else if (idStr.startsWith('short_')) pType = 'SHORTS';
    else if (idStr.startsWith('aud_')) pType = 'AUDIOBOOK';
    else if (idStr.startsWith('imgv_')) pType = 'IMAGE_TO_VIDEO';
    else if (idStr.startsWith('txtv_')) pType = 'TEXT_TO_VIDEO';
    else if (idStr.startsWith('fash_')) pType = 'FASHION_SHOOT';
    else pType = 'AVATAR';
  }

  // Robust date parsing
  // The DB 'created_at' column is int8 (bigint), but might come back as a number or a string representing a number.
  // It could also be an ISO string if the schema was modified to timestamptz.
  let createdAt = Date.now();
  
  if (row.created_at) {
      const asNum = Number(row.created_at);
      if (!isNaN(asNum) && asNum > 0) {
          // It's a timestamp number (e.g. 1764539352202)
          createdAt = asNum;
      } else {
          // Try parsing as ISO Date string
          const parsed = new Date(row.created_at).getTime();
          if (!isNaN(parsed)) createdAt = parsed;
      }
  }

  return {
    id: row.id,
    templateId: row.template_id || 'unknown',
    templateName: row.template_name || 'Untitled Project',
    thumbnailUrl: row.thumbnail_url || '',
    status: row.status as ProjectStatus,
    videoUrl: row.video_url,
    error: row.error,
    createdAt: createdAt,
    type: pType as 'AVATAR' | 'UGC_PRODUCT' | 'FASHION_SHOOT' | 'SHORTS' | 'STORYBOOK' | 'AUDIOBOOK' | 'IMAGE_TO_VIDEO' | 'TEXT_TO_VIDEO',
    cost: row.cost || 1, 
    user_email: row.user_email
  };
};

// --- Mock/Local Implementation ---
const PROJECT_STORAGE_KEY = 'loopgenie_projects';

const getLocalProjects = (): any[] => {
  const stored = localStorage.getItem(PROJECT_STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
};

const saveLocalProjects = (projects: any[]) => {
  localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
};

const saveToLocalStorage = (project: Project) => {
    const projects = getLocalProjects();
    const index = projects.findIndex((p: any) => p.id === project.id);
    const row = {
      id: project.id,
      template_id: project.templateId,
      template_name: project.templateName,
      thumbnail_url: project.thumbnailUrl,
      status: project.status,
      video_url: project.videoUrl,
      error: project.error,
      created_at: project.createdAt,
      project_type: project.type,
      cost: project.cost
    };

    if (index >= 0) {
      projects[index] = { ...projects[index], ...row };
    } else {
      projects.unshift(row);
    }
    saveLocalProjects(projects);
};

// --- Caching ---
let adminProjectsCache: { data: Project[], timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// --- Service Methods ---

export const fetchProjects = async (): Promise<{ projects: Project[], error?: any }> => {
  if (!isSupabaseConfigured()) {
    const localData = getLocalProjects();
    return { projects: localData.map(mapRowToProject) };
  }

  try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // Fix for "TypeError: Failed to fetch" (Network Error)
        if (error.message?.includes('Failed to fetch') || (error.details && typeof error.details === 'string' && error.details.includes('Failed to fetch'))) {
            console.warn("Supabase unreachable (Network Error). Falling back to local data.");
            const localData = getLocalProjects();
            return { projects: localData.map(mapRowToProject) };
        }

        if (error.code === '42P17') {
            console.error("🔥 CRITICAL DB ERROR: Infinite Recursion in fetchProjects. Run schema fix.");
            return { projects: [], error: { code: '42P17', message: "Database Policy Error: Infinite Recursion. Check SCHEMA.md for fix." } };
        }
        if (error.code === '42P01') {
            // Table doesn't exist, fallback to local
            const localData = getLocalProjects();
            return { projects: localData.map(mapRowToProject) };
        }
        console.error('Error fetching projects:', JSON.stringify(error));
        return { projects: [], error };
      }
      
      return { projects: data.map(mapRowToProject) };
  } catch (err) {
      console.warn("Unexpected error fetching projects:", err);
      // Fallback to local data on exception (e.g. fetch throw)
      const localData = getLocalProjects();
      return { projects: localData.map(mapRowToProject) };
  }
};

// NEW: Admin function to fetch ALL projects across all users
export const fetchAllProjectsAdmin = async (forceRefresh = false): Promise<Project[]> => {
    if (!forceRefresh && adminProjectsCache && (Date.now() - adminProjectsCache.timestamp < CACHE_TTL)) {
        return adminProjectsCache.data;
    }

    if (!isSupabaseConfigured()) {
        const local = getLocalProjects().map(mapRowToProject);
        return local;
    }

    try {
        const { data, error } = await supabase
            .from('projects')
            .select(`
                *,
                profiles:user_id (email)
            `)
            .order('created_at', { ascending: false });

        if (error) {
             // Handle Network Error
             if (error.message?.includes('Failed to fetch')) {
                 throw new Error("Network Error: Failed to fetch");
             }
             if (error.code === '42P17') {
                 console.error("🔥 Infinite Recursion in Admin Fetch.");
             }
             throw error;
        }

        const mapped = data.map((row: any) => ({
            ...mapRowToProject(row),
            user_email: row.profiles?.email
        }));

        adminProjectsCache = { data: mapped, timestamp: Date.now() };
        return mapped;

    } catch (e: any) {
        console.warn("Fetch Admin Projects Failed (Returning Fallback):", e);
        
        // Handle "Failed to fetch" specifically in the catch block if thrown above or by supabase
        if (e.message?.includes('Failed to fetch') || e.message?.includes('Network Error')) {
             return []; // Or local projects if appropriate for admin
        }

        // Fallback to basic fetch if join fails
        try {
            const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
            if (!error && data) return data.map(mapRowToProject);
        } catch (innerE) {
            console.warn("Fallback fetch also failed");
        }
        
        return [];
    }
};

export const deductCredits = async (userId: string, amount: number): Promise<number | null> => {
    if (!isSupabaseConfigured()) return null; 

    const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('credits_balance')
        .eq('id', userId)
        .single();
    
    if (fetchError || !profile) {
        console.error("Error fetching balance for deduction:", JSON.stringify(fetchError));
        return null; 
    }

    if (profile.credits_balance < amount) {
        throw new Error(`Insufficient credits. You have ${profile.credits_balance}, but ${amount} is required.`);
    }

    const newBalance = profile.credits_balance - amount;

    const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({ credits_balance: newBalance })
        .eq('id', userId)
        .select('credits_balance')
        .single();

    if (updateError) {
        console.error("Error updating credits:", JSON.stringify(updateError));
        throw new Error("Failed to deduct credits. Please try again.");
    }
    
    return updatedProfile.credits_balance;
};

export const refundCredits = async (userId: string, amount: number): Promise<number | null> => {
    return addCredits(userId, amount);
};

export const addCredits = async (userId: string, amount: number): Promise<number | null> => {
    if (!isSupabaseConfigured()) return null;

    const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('credits_balance')
        .eq('id', userId)
        .single();
    
    if (fetchError || !profile) {
        console.error("Error fetching profile for adding credits:", JSON.stringify(fetchError));
        return null;
    }

    const newBalance = profile.credits_balance + amount;

    const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({ credits_balance: newBalance })
        .eq('id', userId)
        .select('credits_balance')
        .single();
        
    if (updateError) {
        console.error("Error adding credits:", JSON.stringify(updateError));
        return null;
    }
    
    return updatedProfile.credits_balance;
};

export const saveProject = async (project: Project) => {
  if (!isSupabaseConfigured()) {
    saveToLocalStorage(project);
    return;
  }

  const user = await supabase.auth.getUser();
  if (!user.data.user) {
      saveToLocalStorage(project);
      return; 
  }

  const templateIdSafe = project.templateId || 'unknown_template';

  // Sanitize payload to remove undefined values which Supabase might reject
  const payload = {
      id: project.id,
      user_id: user.data.user.id,
      template_id: templateIdSafe, 
      template_name: project.templateName || 'Untitled',
      thumbnail_url: project.thumbnailUrl,
      status: project.status,
      video_url: project.videoUrl,
      error: project.error,
      // FIXED: Send raw number for BigInt column, do NOT convert to ISO String
      created_at: project.createdAt, 
      project_type: project.type || 'AVATAR',
      cost: project.cost ?? 1
  };

  const { error } = await supabase
    .from('projects')
    .upsert(payload);

  if (error) {
    if (error.code === '42P01') {
        saveToLocalStorage(project);
        return;
    }
    // FALLBACK: If 'cost' column missing, try saving without it
    if (error.message?.includes('cost') || error.code === 'PGRST204') {
        console.warn("⚠️ Database missing 'cost' column. Retrying save without cost tracking...");
        const { cost, ...safePayload } = payload;
        const retry = await supabase.from('projects').upsert(safePayload);
        if (retry.error) throw new Error(`Database Error (Retry Failed): ${retry.error.message}`);
        return;
    }

    if (error.code === 'PGRST204' || error.message?.includes('project_type')) {
       const { project_type, ...fallbackPayload } = payload;
       const retry = await supabase.from('projects').upsert(fallbackPayload);
       if (retry.error) throw new Error(`Database Error: ${retry.error.message}`);
       return;
    }
    throw new Error(`Database Error: ${error.message || JSON.stringify(error)}`);
  }
};

export const updateProjectStatus = async (id: string, updates: Partial<Project>) => {
  if (!isSupabaseConfigured()) {
    const projects = getLocalProjects();
    const index = projects.findIndex((p: any) => p.id === id);
    if (index >= 0) {
      if (updates.status) projects[index].status = updates.status;
      if (updates.videoUrl) projects[index].video_url = updates.videoUrl;
      if (updates.thumbnailUrl) projects[index].thumbnail_url = updates.thumbnailUrl;
      if (updates.error) projects[index].error = updates.error;
      saveLocalProjects(projects);
    }
    return;
  }

  const dbUpdates: any = {};
  if (updates.status) dbUpdates.status = updates.status;
  if (updates.videoUrl) dbUpdates.video_url = updates.videoUrl;
  if (updates.thumbnailUrl) dbUpdates.thumbnail_url = updates.thumbnailUrl;
  if (updates.error) dbUpdates.error = updates.error;

  const { error } = await supabase
    .from('projects')
    .update(dbUpdates)
    .eq('id', id);

  if (error) {
      console.error('Error updating project:', JSON.stringify(error));
  }
};
