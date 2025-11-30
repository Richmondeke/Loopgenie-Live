
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
  return supabase.auth.getSession();
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!isSupabaseConfigured()) {
    const user = getMockUser();
    // HARDCODED ADMIN FOR DEMO
    const isAdmin = user?.email === 'admin@demo.com' || user?.email === 'richmondeke@gmail.com';
    return { id: userId, email: user?.email || 'mock@demo.com', credits_balance: 5, isAdmin };
  }
  
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === '42P17') {
          console.error("🔥 CRITICAL DB ERROR: Infinite Recursion Detected.");
          console.error("👉 Please run the 'Emergency Fix' script in SCHEMA.md in your Supabase SQL Editor.");
      }
      if (error.code === 'PGRST116' || error.code === '42P01') {
        // Fallback for missing profile
        const { data: userData } = await supabase.auth.getUser();
        const email = userData.user?.email || '';
        const isAdmin = email === 'admin@demo.com' || email === 'richmondeke@gmail.com';
        return { id: userId, email, credits_balance: 5, isAdmin };
      }
      console.error("Error fetching profile:", error.message || error);
      return { id: userId, email: '', credits_balance: 5 };
    }
    
    // Check if admin based on email or DB flag
    const isAdmin = 
        data.email === 'admin@demo.com' || 
        data.email === 'richmondeke@gmail.com' || 
        (data as any).is_admin === true;

    return {
        ...data,
        credits_balance: (data as any).credits_balance ?? 5,
        isAdmin
    } as UserProfile;

  } catch (err: any) {
      console.error("Unexpected error in getUserProfile:", err.message || err);
      return { id: userId, email: '', credits_balance: 5 };
  }
};

// NEW: Admin function to get all users
export const getAllProfiles = async (forceRefresh = false): Promise<UserProfile[]> => {
    // Return cached data if available and fresh
    if (!forceRefresh && profilesCache && (Date.now() - profilesCache.timestamp < CACHE_TTL)) {
        return profilesCache.data;
    }

    // MOCK DATA for Admin Dashboard Demo
    if (!isSupabaseConfigured()) {
        return [
            { id: '1', email: 'admin@demo.com', full_name: 'Admin User', credits_balance: 999, isAdmin: true },
            { id: '2', email: 'sarah@creative.com', full_name: 'Sarah Creative', credits_balance: 12, isAdmin: false },
            { id: '3', email: 'mike@business.com', full_name: 'Mike Business', credits_balance: 45, isAdmin: false },
            { id: '4', email: 'new@user.com', full_name: 'New User', credits_balance: 5, isAdmin: false },
            { id: '5', email: 'demo@tester.com', full_name: 'Demo Tester', credits_balance: 0, isAdmin: false },
        ];
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('updated_at', { ascending: false }); // Use updated_at which is safe
            
        if (error) {
             if (error.code === '42P17') {
                 console.error("🔥 Infinite Recursion Error in getAllProfiles. Run schema fix.");
             }
             throw error;
        }
        
        const mapped = data.map((p: any) => ({
            id: p.id,
            email: p.email,
            full_name: p.full_name,
            credits_balance: p.credits_balance,
            isAdmin: p.email === 'admin@demo.com' || p.email === 'richmondeke@gmail.com' || p.is_admin
        }));

        // Update Cache
        profilesCache = { data: mapped, timestamp: Date.now() };
        return mapped;

    } catch (e) {
        console.warn("Failed to fetch all profiles (likely permissions):", e);
        // Fallback mock data if RLS blocks listing all users
        return [
             { id: '1', email: 'admin@demo.com', full_name: 'Admin User', credits_balance: 999, isAdmin: true },
             { id: '2', email: 'user@demo.com', full_name: 'Demo User', credits_balance: 15, isAdmin: false },
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
      data: {
        full_name: fullName,
      },
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
  if (!isSupabaseConfigured()) {
    return getMockUser();
  }
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};
