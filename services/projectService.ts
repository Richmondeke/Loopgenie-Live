
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
  let createdAt = Date.now();
  
  if (row.created_at) {
      const asNum = Number(row.created_at);
      if (!isNaN(asNum) && asNum > 0) {
          createdAt = asNum;
      } else {
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
      // Limit to 50 recent projects to prevent timeouts/slow loading
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn("Supabase Error:", error);
        // Fallback to local data on ANY error (500, Network, etc)
        const localData = getLocalProjects();
        
        // Return explicit error for UI handling if it's the recursion bug
        if (error.code === '42P17') {
            return { projects: localData.map(mapRowToProject), error: { code: '42P17', message: "Database Policy Error." } };
        }
        
        return { projects: localData.map(mapRowToProject) };
      }
      
      return { projects: data.map(mapRowToProject) };
  } catch (err) {
      console.warn("Unexpected error fetching projects:", err);
      const localData = getLocalProjects();
      return { projects: localData.map(mapRowToProject) };
  }
};

// NEW: Lightweight Stats Fetcher
// Fetches ONLY metadata needed for calculations, no heavy URLs or text
export const fetchProjectStatsAdmin = async (): Promise<{ totalCost: number, totalFailed: number, totalCount: number, activeUsers: number }> => {
    if (!isSupabaseConfigured()) return { totalCost: 0, totalFailed: 0, totalCount: 0, activeUsers: 0 };

    try {
        const { data, error } = await supabase
            .from('projects')
            .select('cost, status, user_id');
        
        if (error) throw error;

        const totalCount = data.length;
        const totalCost = data.reduce((acc, curr) => acc + (curr.cost || 0), 0);
        const totalFailed = data.filter(p => p.status === 'failed').length;
        const activeUsers = new Set(data.map(p => p.user_id)).size;

        return { totalCost, totalFailed, totalCount, activeUsers };
    } catch (e) {
        console.warn("Failed to fetch stats:", e);
        return { totalCost: 0, totalFailed: 0, totalCount: 0, activeUsers: 0 };
    }
};

export const fetchAllProjectsAdmin = async (forceRefresh = false): Promise<Project[]> => {
    if (!forceRefresh && adminProjectsCache && (Date.now() - adminProjectsCache.timestamp < CACHE_TTL)) {
        return adminProjectsCache.data;
    }

    if (!isSupabaseConfigured()) {
        const local = getLocalProjects().map(mapRowToProject);
        return local;
    }

    try {
        // Limit to 100 for admin table to ensure stability
        const { data, error } = await supabase
            .from('projects')
            .select(`
                *,
                profiles:user_id (email)
            `)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        const mapped = data.map((row: any) => ({
            ...mapRowToProject(row),
            user_email: row.profiles?.email
        }));

        adminProjectsCache = { data: mapped, timestamp: Date.now() };
        return mapped;

    } catch (e: any) {
        console.warn("Fetch Admin Projects Failed (Returning Fallback):", e);
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
        console.error("Error fetching balance:", JSON.stringify(fetchError));
        return null; 
    }

    if (profile.credits_balance < amount) {
        throw new Error(`Insufficient credits.`);
    }

    const newBalance = profile.credits_balance - amount;

    const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({ credits_balance: newBalance })
        .eq('id', userId)
        .select('credits_balance')
        .single();

    if (updateError) throw new Error("Failed to deduct credits.");
    
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
    
    if (fetchError || !profile) return null;

    const newBalance = profile.credits_balance + amount;

    const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({ credits_balance: newBalance })
        .eq('id', userId)
        .select('credits_balance')
        .single();
        
    if (updateError) return null;
    
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

  // Sanitize payload
  const payload = {
      id: project.id,
      user_id: user.data.user.id,
      template_id: templateIdSafe, 
      template_name: project.templateName || 'Untitled',
      thumbnail_url: project.thumbnailUrl,
      status: project.status,
      video_url: project.videoUrl,
      error: project.error,
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
    // Fallbacks for missing columns
    if (error.message?.includes('cost') || error.code === 'PGRST204') {
        const { cost, ...safePayload } = payload;
        await supabase.from('projects').upsert(safePayload);
        return;
    }
    console.error("Save Project DB Error:", error);
    // Don't throw if we can save locally as backup
    saveToLocalStorage(project);
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

  await supabase.from('projects').update(dbUpdates).eq('id', id);
};
