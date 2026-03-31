
import { auth, db, isFirebaseConfigured } from '../firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updatePassword as firebaseUpdatePassword,
  User as FirebaseUser
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { UserProfile } from '../types';

// --- Types ---
// Mapping Firebase User to the local User interface if needed
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

const ADMIN_EMAILS = [
  'admin@demo.com',
  'richmondeke@gmail.com',
  'ekerichmond@gmail.com'
];

export const isUserAdmin = (email: string | null | undefined): boolean => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
};

// --- Service Methods ---

export const getSession = async () => {
  if (!isFirebaseConfigured()) {
    const user = getMockUser();
    return { data: { session: user ? { user } : null }, error: null };
  }

  const user = auth.currentUser;
  return { data: { session: user ? { user } : null }, error: null };
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!isFirebaseConfigured()) {
    const user = getMockUser();
    return {
      id: userId,
      email: user?.email || 'mock@demo.com',
      credits_balance: 5,
      isAdmin: isUserAdmin(user?.email)
    };
  }

  try {
    const docRef = doc(db, 'profiles', userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const userEmail = (data.email || '').toLowerCase();
      const isAdmin = isUserAdmin(userEmail) || data.isAdmin === true;

      return {
        id: userId,
        email: data.email || '',
        full_name: data.full_name || '',
        credits_balance: data.credits_balance ?? 5,
        isAdmin,
        webhook_url: data.webhook_url,
        webhook_method: data.webhook_method
      } as UserProfile;
    } else {
      // If profile doesn't exist, create one with default credits
      const user = auth.currentUser;
      const email = user?.email || '';
      const fullName = user?.displayName || '';

      const newProfile = {
        id: userId,
        email,
        full_name: fullName,
        credits_balance: 5,
        isAdmin: isUserAdmin(email)
      };

      try {
        await setDoc(docRef, {
          email,
          full_name: fullName,
          credits_balance: 5,
          isAdmin: isUserAdmin(email)
        });
      } catch (err) {
        console.warn("Failed to create default profile in Firestore:", err);
      }

      return newProfile;
    }
  } catch (err: any) {
    console.error("Unexpected error in getUserProfile:", err.message || err);
    const user = auth.currentUser;
    const email = user?.email || '';
    return { id: userId, email, credits_balance: 5, isAdmin: isUserAdmin(email) };
  }
};

export const updateUserProfile = async (userId: string, updates: Partial<UserProfile>): Promise<{ success: boolean; error?: string }> => {
  if (!isFirebaseConfigured()) {
    return { success: true };
  }

  try {
    const docRef = doc(db, 'profiles', userId);
    await setDoc(docRef, updates, { merge: true });

    // Clear cache
    profilesCache = null;

    return { success: true };
  } catch (e: any) {
    const errorMsg = e.message || String(e);
    console.error("Update User Profile Error:", errorMsg);
    return { success: false, error: errorMsg };
  }
};

export const getAllProfiles = async (forceRefresh = false): Promise<UserProfile[]> => {
  if (!forceRefresh && profilesCache && (Date.now() - profilesCache.timestamp < CACHE_TTL)) {
    return profilesCache.data;
  }

  if (!isFirebaseConfigured()) {
    return [
      { id: '1', email: 'admin@demo.com', full_name: 'Admin User', credits_balance: 999, isAdmin: true },
      { id: '2', email: 'user@demo.com', full_name: 'Demo User', credits_balance: 15, isAdmin: false },
    ];
  }

  try {
    const q = query(collection(db, 'profiles'), orderBy('email'));
    const querySnapshot = await getDocs(q);

    const mapped: UserProfile[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const userEmail = (data.email || '').toLowerCase();
      mapped.push({
        id: doc.id,
        email: data.email || '',
        full_name: data.full_name || '',
        credits_balance: data.credits_balance ?? 5,
        isAdmin: isUserAdmin(userEmail) || data.isAdmin,
        webhook_url: data.webhook_url,
        webhook_method: data.webhook_method
      });
    });

    profilesCache = { data: mapped, timestamp: Date.now() };
    return mapped;

  } catch (e) {
    console.warn("Failed to fetch all profiles:", e);
    // Return current user as a minimal fallback if we can't fetch anything
    const user = auth.currentUser;
    if (user && isUserAdmin(user.email)) {
      return [{
        id: user.uid,
        email: user.email || '',
        full_name: 'Admin (Local)',
        credits_balance: 5,
        isAdmin: true
      }];
    }
    return [];
  }
};

export const subscribeToUserProfile = (userId: string, callback: (profile: UserProfile | null) => void) => {
  if (!isFirebaseConfigured()) {
    // Mock real-time update
    const user = getMockUser();
    callback({
      id: userId,
      email: user?.email || 'mock@demo.com',
      credits_balance: 5,
      isAdmin: isUserAdmin(user?.email)
    });
    return () => { };
  }

  const docRef = doc(db, 'profiles', userId);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      const userEmail = (data.email || '').toLowerCase();
      const isAdmin = isUserAdmin(userEmail) || data.isAdmin === true;

      callback({
        id: userId,
        email: data.email || '',
        full_name: data.full_name || '',
        credits_balance: data.credits_balance ?? 5,
        isAdmin,
        webhook_url: data.webhook_url,
        webhook_method: data.webhook_method
      } as UserProfile);
    } else {
      callback(null);
    }
  }, (err) => {
    console.error("Profile subscription error:", err);
  });
};

export const subscribeToAllProfiles = (callback: (profiles: UserProfile[]) => void) => {
  if (!isFirebaseConfigured()) {
    callback([
      { id: '1', email: 'admin@demo.com', full_name: 'Admin User', credits_balance: 999, isAdmin: true },
      { id: '2', email: 'user@demo.com', full_name: 'Demo User', credits_balance: 15, isAdmin: false },
    ]);
    return () => { };
  }

  const q = query(collection(db, 'profiles'), orderBy('email'));
  return onSnapshot(q, (querySnapshot) => {
    const mapped: UserProfile[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const userEmail = (data.email || '').toLowerCase();
      mapped.push({
        id: doc.id,
        email: data.email || '',
        full_name: data.full_name || '',
        credits_balance: data.credits_balance ?? 5,
        isAdmin: isUserAdmin(userEmail) || data.isAdmin,
        webhook_url: data.webhook_url,
        webhook_method: data.webhook_method
      });
    });
    callback(mapped);
  }, (err) => {
    console.error("All profiles subscription error:", err);
  });
};

export const onAuthStateChange = (callback: (event: string, session: any) => void) => {
  if (!isFirebaseConfigured()) {
    const handler = () => {
      const user = getMockUser();
      callback(user ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { user } : null);
    };
    window.addEventListener('auth-change', handler);
    handler();
    return { data: { subscription: { unsubscribe: () => window.removeEventListener('auth-change', handler) } } };
  }

  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user) {
      callback('SIGNED_IN', { user });
    } else {
      callback('SIGNED_OUT', null);
    }
  });

  return { data: { subscription: { unsubscribe } } };
};

export const signUp = async (email: string, password: string, fullName: string) => {
  if (!isFirebaseConfigured()) {
    const newUser: User = {
      id: `user_${Date.now()}`,
      email,
      user_metadata: { full_name: fullName }
    };
    setMockUser(newUser);
    return { data: { user: newUser, session: { user: newUser } }, error: null };
  }

  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  const userEmail = email.toLowerCase();
  await setDoc(doc(db, 'profiles', user.uid), {
    email,
    full_name: fullName,
    credits_balance: 5,
    isAdmin: isUserAdmin(userEmail)
  });

  return { user };
};

export const signIn = async (email: string, password: string) => {
  if (!isFirebaseConfigured()) {
    const mockUser: User = {
      id: 'mock_user_123',
      email,
      user_metadata: { full_name: 'Demo User' }
    };
    setMockUser(mockUser);
    return { data: { user: mockUser, session: { user: mockUser } }, error: null };
  }

  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return { user: userCredential.user };
};

export const signOut = async () => {
  if (!isFirebaseConfigured()) {
    setMockUser(null);
    return { error: null };
  }
  await firebaseSignOut(auth);
};

export const resetPassword = async (email: string) => {
  if (!isFirebaseConfigured()) {
    return { error: null };
  }
  await sendPasswordResetEmail(auth, email);
};

export const updatePassword = async (newPassword: string) => {
  if (!isFirebaseConfigured()) return { error: null };
  const user = auth.currentUser;
  if (user) {
    await firebaseUpdatePassword(user, newPassword);
  }
};

export const getCurrentUser = async () => {
  if (!isFirebaseConfigured()) return getMockUser();
  return auth.currentUser;
};
