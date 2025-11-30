
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
    else pType = 'AVATAR';
  }

  return {
    id: row.id,
    templateId: row.template_id || 'unknown',
    templateName: row.template_name || 'Untitled Project',
    thumbnailUrl: row.thumbnail_url || '',
    status: row.status as ProjectStatus,
    videoUrl: row.video_url,
    error: row.error,
    createdAt: row.created_at || Date.now(),
    type: pType as 'AVATAR' | 'UGC_PRODUCT',
    cost: row.cost || 1, // Add cost if available
    user_email: row.user_email // Add email if available via join
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

export const fetchProjects = async (): Promise<Project[]> => {
  if (!isSupabaseConfigured()) {
    const localData = getLocalProjects();
    return localData.map(mapRowToProject);
  }

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === '42P17') {
        console.error("🔥 CRITICAL DB ERROR: Infinite Recursion in fetchProjects. Run schema fix.");
    }
    if (error.code === '42P01') {
        const localData = getLocalProjects();
        return localData.map(mapRowToProject);
    }
    console.error('Error fetching projects:', JSON.stringify(error));
    return [];
  }
  return data.map(mapRowToProject);
};

// NEW: Admin function to fetch ALL projects across all users
export const fetchAllProjectsAdmin = async (forceRefresh = false): Promise<Project[]> => {
    if (!forceRefresh && adminProjectsCache && (Date.now() - adminProjectsCache.timestamp < CACHE_TTL)) {
        return adminProjectsCache.data;
    }

    if (!isSupabaseConfigured()) {
        // Return local projects + some mock ones to simulate activity
        const local = getLocalProjects().map(mapRowToProject);
        const mocks = [
            { id: 'mock_1', templateName: 'Viral Short #1', status: 'completed', createdAt: Date.now() - 3600000, type: 'SHORTS', cost: 3, user_email: 'sarah@creative.com' },
            { id: 'mock_2', templateName: 'Product Ad', status: 'completed', createdAt: Date.now() - 7200000, type: 'UGC_PRODUCT', cost: 3, user_email: 'mike@business.com' },
            { id: 'mock_3', templateName: 'Storybook', status: 'processing', createdAt: Date.now() - 100000, type: 'STORYBOOK', cost: 2, user_email: 'new@user.com' },
        ];
        return [...local, ...mocks] as Project[];
    }

    try {
        // Fetch projects joined with profiles to get email
        // Note: This assumes RLS policies allow admin to read all rows
        const { data, error } = await supabase
            .from('projects')
            .select(`
                *,
                profiles:user_id (email)
            `)
            .order('created_at', { ascending: false });

        if (error) {
             if (error.code === '42P17') {
                 console.error("🔥 Infinite Recursion in Admin Fetch. Please run the fix script in SCHEMA.md");
             }
             throw error;
        }

        const mapped = data.map((row: any) => ({
            ...mapRowToProject(row),
            user_email: row.profiles?.email
        }));

        adminProjectsCache = { data: mapped, timestamp: Date.now() };
        return mapped;

    } catch (e) {
        console.warn("Fetch Admin Projects Failed:", e);
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
      cost: project.cost // Ensure cost is saved
  };

  const { error } = await supabase
    .from('projects')
    .upsert(payload);

  if (error) {
    if (error.code === '42P01') {
        saveToLocalStorage(project);
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
      if (error.code === '42P01') {
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
      console.error('Error updating project:', JSON.stringify(error));
  }
};
