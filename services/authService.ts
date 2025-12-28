
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { UserProfile } from '../types';

// --- Types ---
interface User {
  id: string;
  email: string;
  user_metadata: { full_name: string };
}

// --- Mock/Local Implementation ---
const MOCK_STORAGE_KEY = 'loopgenie_mock_user';

const getMockUser = (): User | null => {
  const stored = localStorage.getItem(MOCK_STORAGE_KEY);
  return stored ? JSON.parse(stored) : null;
};

const setMockUser = (user: User | null) => {
  if (user) localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(MOCK_STORAGE_KEY);
  
  // Trigger event for UI update
  window.dispatchEvent(new Event('auth-change'));
};

// --- Caching ---
let profilesCache: { data: UserProfile[], timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// --- Service Methods ---

export const getSession = async () => {
  if (!isSupabaseConfigured()) {
    const user = getMockUser();
    return { data: { session: user ? { user } : null }, error: null };
  }
  try {
      return await supabase.auth.getSession();
  } catch (error) {
      console.warn("Error getting session:", error);
      return { data: { session: null }, error };
  }
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!isSupabaseConfigured()) {
    const user = getMockUser();
    const isAdmin = user?.email === 'admin@demo.com' || user?.email === 'richmondeke@gmail.com';
    return { id: userId, email: user?.email || 'mock@demo.com', credits_balance: 5, isAdmin };
  }
  
  try {
    // Attempt full fetch including webhook columns
    let { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, credits_balance, is_admin, webhook_url, webhook_method')
      .eq('id', userId)
      .single();

    // GRACEFUL FALLBACK: If columns don't exist (Error 42703 or specific message), retry without them
    const isMissingColumnError = error && (
        error.code === '42703' || 
        error.message?.toLowerCase().includes('webhook_url') || 
        error.message?.toLowerCase().includes('does not exist') ||
        error.message?.toLowerCase().includes('column')
    );

    if (isMissingColumnError) {
        console.warn("[AuthService] Webhook columns missing in DB. Using fallback profile fetch.");
        const fallback = await supabase
          .from('profiles')
          .select('id, email, full_name, credits_balance, is_admin')
          .eq('id', userId)
          .single();
        
        data = fallback.data;
        error = fallback.error;
    }

    if (error) {
      if (error.code === '42P17') {
          console.error("🔥 CRITICAL DB ERROR: Infinite Recursion Detected. Check SCHEMA.md.");
      }
      if (error.code === 'PGRST116' || error.code === '42P01') {
        const { data: userData } = await supabase.auth.getUser();
        const email = userData.user?.email || '';
        const isAdmin = email === 'admin@demo.com' || email === 'richmondeke@gmail.com';
        return { id: userId, email, credits_balance: 5, isAdmin };
      }
      // Log only if it wasn't the column error we handled or if the fallback also failed
      console.error("Error fetching profile:", error.message || error);
      return { id: userId, email: '', credits_balance: 5 };
    }
    
    if (!data) return null;

    const isAdmin = 
        data.email === 'admin@demo.com' || 
        data.email === 'richmondeke@gmail.com' || 
        (data as any).is_admin === true;

    return {
        ...data,
        credits_balance: (data as any).credits_balance ?? 5,
        isAdmin,
        webhook_url: data.webhook_url,
        webhook_method: data.webhook_method
    } as UserProfile;

  } catch (err: any) {
      console.error("Unexpected error in getUserProfile:", err.message || err);
      return { id: userId, email: '', credits_balance: 5 };
  }
};

export const updateUserProfile = async (userId: string, updates: Partial<UserProfile>): Promise<{ success: boolean; error?: string; schemaMismatch?: boolean }> => {
    if (!isSupabaseConfigured()) {
        return { success: true };
    }

    try {
        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId);

        if (error) {
            // DETECT SCHEMA MISMATCH: Column doesn't exist or is not visible in cache
            const isMissingColumnError = 
                error.code === '42703' || 
                error.message?.toLowerCase().includes('column') ||
                error.message?.toLowerCase().includes('does not exist');
            
            if (isMissingColumnError) {
                console.warn("[AuthService] Update failed due to missing columns in DB. Retrying with core fields only.");
                
                // Identify which fields were likely problematic and strip them
                const { webhook_url, webhook_method, ...coreUpdates } = updates as any;
                
                // If there are remaining core updates (like full_name), try to save those
                if (Object.keys(coreUpdates).length > 0) {
                    const fallback = await supabase
                        .from('profiles')
                        .update(coreUpdates)
                        .eq('id', userId);
                    
                    if (fallback.error) throw fallback.error;
                }
                
                // Return success but indicate that some fields couldn't be saved to DB
                return { success: true, schemaMismatch: true };
            }
            throw error;
        }
        
        // Clear cache to ensure next fetch is fresh
        profilesCache = null;
        
        return { success: true };
    } catch (e: any) {
        // Fix: Ensure we log the message and not [object Object]
        const errorMsg = e.message || (typeof e === 'object' ? JSON.stringify(e) : String(e));
        console.error("Update User Profile Error:", errorMsg);
        return { success: false, error: errorMsg };
    }
};

export const getAllProfiles = async (forceRefresh = false): Promise<UserProfile[]> => {
    if (!forceRefresh && profilesCache && (Date.now() - profilesCache.timestamp < CACHE_TTL)) {
        return profilesCache.data;
    }

    if (!isSupabaseConfigured()) {
        return [
            { id: '1', email: 'admin@demo.com', full_name: 'Admin User', credits_balance: 999, isAdmin: true },
            { id: '2', email: 'user@demo.com', full_name: 'Demo User', credits_balance: 15, isAdmin: false },
        ];
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('updated_at', { ascending: false });
            
        if (error) throw error;
        
        const mapped = data.map((p: any) => ({
            id: p.id,
            email: p.email,
            full_name: p.full_name,
            credits_balance: p.credits_balance,
            isAdmin: p.email === 'admin@demo.com' || p.email === 'richmondeke@gmail.com' || p.is_admin,
            webhook_url: p.webhook_url,
            webhook_method: p.webhook_method
        }));

        profilesCache = { data: mapped, timestamp: Date.now() };
        return mapped;

    } catch (e) {
        console.warn("Failed to fetch all profiles:", e);
        return [
             { id: '1', email: 'admin@demo.com', full_name: 'Admin User', credits_balance: 999, isAdmin: true },
        ];
    }
};

export const onAuthStateChange = (callback: (event: string, session: any) => void) => {
  if (!isSupabaseConfigured()) {
    const handler = () => {
      const user = getMockUser();
      callback(user ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { user } : null);
    };
    window.addEventListener('auth-change', handler);
    handler();
    return { data: { subscription: { unsubscribe: () => window.removeEventListener('auth-change', handler) } } };
  }
  return supabase.auth.onAuthStateChange(callback);
};

export const signUp = async (email: string, password: string, fullName: string) => {
  if (!isSupabaseConfigured()) {
    const newUser: User = {
      id: `user_${Date.now()}`,
      email,
      user_metadata: { full_name: fullName }
    };
    setMockUser(newUser);
    return { data: { user: newUser, session: { user: newUser } }, error: null };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: window.location.origin
    },
  });
  if (error) throw error;
  return data;
};

export const signIn = async (email: string, password: string) => {
  if (!isSupabaseConfigured()) {
    const mockUser: User = {
      id: 'mock_user_123',
      email,
      user_metadata: { full_name: 'Demo User' }
    };
    setMockUser(mockUser);
    return { data: { user: mockUser, session: { user: mockUser } }, error: null };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  if (!isSupabaseConfigured()) {
    setMockUser(null);
    return { error: null };
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const resetPassword = async (email: string) => {
  if (!isSupabaseConfigured()) {
    return { error: null };
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin, 
  });
  if (error) throw error;
};

export const updatePassword = async (newPassword: string) => {
    if (!isSupabaseConfigured()) return { error: null };
    const { data, error } = await supabase.auth.updateUser({ 
        password: newPassword 
    });
    if (error) throw error;
    return data;
};

export const getCurrentUser = async () => {
  if (!isSupabaseConfigured()) return getMockUser();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};
