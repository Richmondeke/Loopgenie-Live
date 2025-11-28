
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { Project, ProjectStatus } from '../types';

// --- Types ---
// Map DB row to Project type
const mapRowToProject = (row: any): Project => {
  let pType = row.project_type;

  // Robust fallback: Infer type from ID if column is missing or null
  // This ensures the app works even if the user hasn't run the latest migration
  if (!pType) {
    if (row.id && String(row.id).startsWith('ugc_')) {
      pType = 'UGC_PRODUCT';
    } else {
      pType = 'AVATAR';
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
    createdAt: row.created_at || Date.now(),
    type: pType as 'AVATAR' | 'UGC_PRODUCT'
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

// Helper to save to local storage (reused in fallback)
const saveToLocalStorage = (project: Project) => {
    const projects = getLocalProjects();
    // Check if exists
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
      project_type: project.type
    };

    if (index >= 0) {
      projects[index] = { ...projects[index], ...row };
    } else {
      projects.unshift(row);
    }
    saveLocalProjects(projects);
};

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
    // If table is missing (42P01), fall back to local storage gracefully
    if (error.code === '42P01') {
        console.warn("Projects table missing in Supabase. Falling back to local storage.");
        const localData = getLocalProjects();
        return localData.map(mapRowToProject);
    }

    console.error('Error fetching projects:', error.message || error);
    return [];
  }
  return data.map(mapRowToProject);
};

export const deductCredits = async (userId: string, amount: number): Promise<number | null> => {
    if (!isSupabaseConfigured()) return null; 

    // 1. Fetch current balance to ensure we have the latest
    const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('credits_balance')
        .eq('id', userId)
        .single();
    
    if (fetchError || !profile) {
        console.error("Error fetching balance for deduction:", fetchError);
        return null; 
    }

    if (profile.credits_balance < amount) {
        throw new Error(`Insufficient credits. You have ${profile.credits_balance}, but ${amount} is required.`);
    }

    const newBalance = profile.credits_balance - amount;

    // 2. Perform Update and SELECT the result to confirm persistence
    const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({ credits_balance: newBalance })
        .eq('id', userId)
        .select('credits_balance')
        .single();

    if (updateError) {
        console.error("Error updating credits:", updateError);
        throw updateError;
    }
    
    // Return the confirmed value from the DB
    return updatedProfile.credits_balance;
};

export const refundCredits = async (userId: string, amount: number): Promise<number | null> => {
    return addCredits(userId, amount);
};

export const addCredits = async (userId: string, amount: number): Promise<number | null> => {
    if (!isSupabaseConfigured()) return null;

    // Fetch current to be safe
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
        
    if (updateError) {
        console.error("Error adding credits:", updateError);
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
      // If authenticating fails or running locally without auth but with configured supabase (edge case)
      saveToLocalStorage(project);
      return; 
  }

  // Ensure template_id is never null
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
      project_type: project.type || 'AVATAR'
  };

  const { error } = await supabase
    .from('projects')
    .upsert(payload);

  if (error) {
    // 1. Fallback: Table missing (42P01) -> Save locally
    if (error.code === '42P01') {
        console.warn("Projects table missing in Supabase. Saving to local storage.");
        saveToLocalStorage(project);
        return;
    }

    // 2. Fallback: Schema mismatch (project_type missing) -> Retry without column
    if (error.code === 'PGRST204' || error.message?.includes('project_type')) {
       console.warn("Schema mismatch detected: 'project_type' column missing in DB. Saving without it.");
       
       const { project_type, ...fallbackPayload } = payload;
       
       const retry = await supabase.from('projects').upsert(fallbackPayload);
       
       if (retry.error) {
          console.error('Error saving project (retry failed):', retry.error);
          throw new Error(`Database Error: ${retry.error.message || JSON.stringify(retry.error)}`);
       }
       return;
    }

    console.error('Error saving project:', error);
    // Throw a readable error message
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

  // Only update fields that exist in the DB schema
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
      // If table missing, update local
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
      console.error('Error updating project:', error);
  }
};
