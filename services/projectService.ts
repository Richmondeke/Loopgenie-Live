
import { db, auth, isFirebaseConfigured } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  updateDoc,
  increment,
  runTransaction,
  onSnapshot
} from 'firebase/firestore';
import { Project, ProjectStatus, YouTubeChannel, YouTubeEpisode } from '../types';
import { triggerWebhook } from './webhookService';

// Added missing cache variables
let adminProjectsCache: { data: Project[], timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// --- Types ---
const mapRowToProject = (id: string, data: any): Project => {
  let pType = data.project_type;

  if (!pType) {
    const idStr = String(id || '');
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

  if (data.created_at) {
    const asNum = Number(data.created_at);
    if (!isNaN(asNum) && asNum > 0) {
      createdAt = asNum;
    } else {
      const parsed = new Date(data.created_at).getTime();
      if (!isNaN(parsed)) createdAt = parsed;
    }
  }

  return {
    id: id,
    templateId: data.template_id || data.templateId || 'unknown',
    templateName: data.template_name || data.templateName || 'Untitled Project',
    thumbnailUrl: data.thumbnail_url || data.thumbnailUrl || '',
    status: (data.status || ProjectStatus.PENDING) as ProjectStatus,
    videoUrl: data.video_url || data.videoUrl,
    error: data.error,
    createdAt: createdAt,
    type: (data.project_type || data.type || pType) as any,
    cost: data.cost || 1,
    user_email: data.user_email || data.userEmail,
    metadata: data.metadata || data.manifest
  };
};

// --- Mock/Local Implementation ---
const PROJECT_STORAGE_KEY = 'loopgenie_projects';
const MAX_LOCAL_PROJECTS = 20;

const getLocalProjects = (): any[] => {
  try {
    const stored = localStorage.getItem(PROJECT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("[ProjectService] Failed to read from LocalStorage:", e);
    return [];
  }
};

const saveLocalProjects = (projects: any[]) => {
  // Always limit total number of local projects
  const limited = projects.slice(0, MAX_LOCAL_PROJECTS);

  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(limited));
  } catch (e) {
    console.warn("[ProjectService] LocalStorage quota exceeded. Aggressive pruning...");

    // Aggressive pruning: Keep metadata ONLY for the most recent project
    const pruned = limited.map((p, idx) => {
      if (idx === 0) return p; // Keep metadata for the very last one
      const { metadata, ...rest } = p;
      return rest;
    });

    try {
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(pruned));
    } catch (e2) {
      // Last resort: Keep only the last 5 projects without metadata
      console.error("[ProjectService] LocalStorage still full. Minimal save.");
      const minimal = pruned.slice(0, 5).map(p => {
        const { metadata, ...rest } = p;
        return rest;
      });
      try {
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(minimal));
      } catch (e3) {
        console.error("[ProjectService] LocalStorage is completely unusable.");
      }
    }
  }
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
    cost: project.cost,
    metadata: project.metadata
  };

  if (index >= 0) {
    projects[index] = { ...projects[index], ...row };
  } else {
    projects.unshift(row);
  }
  saveLocalProjects(projects);
};

// --- Channel Local Storage ---
const CHANNEL_STORAGE_KEY = 'loopgenie_channels';

const getLocalChannels = (): YouTubeChannel[] => {
  try {
    const stored = localStorage.getItem(CHANNEL_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("[ProjectService] Failed to read channels from LocalStorage:", e);
    return [];
  }
};

const saveLocalChannels = (channels: YouTubeChannel[]) => {
  try {
    localStorage.setItem(CHANNEL_STORAGE_KEY, JSON.stringify(channels));
  } catch (e) {
    console.error("[ProjectService] LocalStorage channel save failed:", e);
  }
};

const saveChannelToLocalStorage = (channel: YouTubeChannel) => {
  const channels = getLocalChannels();
  const index = channels.findIndex(c => c.id === channel.id);
  if (index >= 0) {
    channels[index] = { ...channels[index], ...channel };
  } else {
    channels.unshift(channel);
  }
  saveLocalChannels(channels);
};

// --- Webhook Helper ---
const getUserWebhookUrl = async (userId: string): Promise<string | undefined> => {
  const localUrl = localStorage.getItem('loopgenie_webhook_url') || undefined;

  if (!isFirebaseConfigured()) {
    return localUrl;
  }

  try {
    const docRef = doc(db, 'profiles', userId);
    const docSnap = await getDoc(docRef);
    return docSnap.data()?.webhook_url || localUrl;
  } catch (e) {
    return localUrl;
  }
};

// --- Service Methods ---

export const fetchProjects = async (): Promise<{ projects: Project[], error?: any }> => {
  if (!isFirebaseConfigured()) {
    const localData = getLocalProjects();
    return { projects: localData.map(row => mapRowToProject(row.id, row)) };
  }

  try {
    const user = auth.currentUser;
    if (!user) {
      const localData = getLocalProjects();
      return { projects: localData.map(row => mapRowToProject(row.id, row)) };
    }

    // Try indexed query first; fall back to simple query + client-side sort if index is missing
    let projects: Project[] = [];
    try {
      const q = query(
        collection(db, 'projects'),
        where('user_id', '==', user.uid),
        orderBy('created_at', 'desc'),
        limit(50)
      );
      const snap = await getDocs(q);
      snap.forEach(d => projects.push(mapRowToProject(d.id, d.data())));
    } catch (indexErr: any) {
      // Missing index -- fall back to filterOnly query, sort client-side
      console.warn('[ProjectService] Falling back to simple query (index may be missing):', indexErr?.message);
      const q2 = query(collection(db, 'projects'), where('user_id', '==', user.uid), limit(50));
      const snap2 = await getDocs(q2);
      snap2.forEach(d => projects.push(mapRowToProject(d.id, d.data())));
      projects.sort((a, b) => b.createdAt - a.createdAt);
    }

    return { projects };
  } catch (err) {
    console.warn("Unexpected error fetching projects:", err);
    const localData = getLocalProjects();
    return { projects: localData.map(row => mapRowToProject(row.id, row)) };
  }
};

export const subscribeToProjects = (userIdOrCallback: string | ((projects: Project[]) => void), maybeCallback?: (projects: Project[]) => void) => {
  const userId = typeof userIdOrCallback === 'string' ? userIdOrCallback : auth.currentUser?.uid;
  const callback = typeof userIdOrCallback === 'function' ? userIdOrCallback : maybeCallback;

  if (!callback) return () => { };

  if (!isFirebaseConfigured()) {
    const localData = getLocalProjects();
    callback(localData.map(row => mapRowToProject(row.id, row)));
    return () => { };
  }

  if (!userId) {
    callback([]);
    return () => { };
  }

  // Try the indexed query (user_id + created_at). If it fails due to a missing index,
  // fall back to a simple query and sort client-side.
  const indexedQ = query(
    collection(db, 'projects'),
    where('user_id', '==', userId),
    orderBy('created_at', 'desc'),
    limit(50)
  );

  const unsub = onSnapshot(indexedQ, (querySnapshot) => {
    const projects: Project[] = [];
    querySnapshot.forEach((doc) => {
      projects.push(mapRowToProject(doc.id, doc.data()));
    });
    callback(projects);
  }, (err: any) => {
    console.warn('[ProjectService] Indexed subscription failed, falling back to simple query:', err?.message);
    // Unsub from failed listener and retry without orderBy
    unsub();
    const simpleQ = query(collection(db, 'projects'), where('user_id', '==', userId), limit(50));
    onSnapshot(simpleQ, (snap) => {
      const projects: Project[] = [];
      snap.forEach(d => projects.push(mapRowToProject(d.id, d.data())));
      projects.sort((a, b) => b.createdAt - a.createdAt);
      callback(projects);
    }, (err2) => {
      console.warn('[ProjectService] Simple subscription also failed:', err2);
      // Final fallback: local storage
      callback(getLocalProjects().map(row => mapRowToProject(row.id, row)));
    });
  });

  return unsub;
};

// --- YouTube Channel Persistence ---

export const saveChannel = async (channel: YouTubeChannel) => {
  if (!isFirebaseConfigured()) {
    saveChannelToLocalStorage(channel);
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    saveChannelToLocalStorage(channel);
    return;
  }

  // Ensure channel has the current user ID for ownership
  const payload = {
    ...channel,
    userId: user.uid,
    userEmail: user.email || ''
  };

  try {
    console.log(`[ProjectService] Saving channel ${channel.id} for user ${user.uid}`);
    await setDoc(doc(db, 'channels', channel.id), payload, { merge: true });
  } catch (error) {
    console.error("Save Channel Firestore Error:", error);
    saveChannelToLocalStorage(channel);
  }
};

export const subscribeToChannels = (userId: string, callback: (channels: YouTubeChannel[]) => void) => {
  if (!isFirebaseConfigured()) {
    callback([]);
    return () => { };
  }

  const indexedQ = query(
    collection(db, 'channels'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  const unsub = onSnapshot(indexedQ, (querySnapshot) => {
    const channels: YouTubeChannel[] = [];
    querySnapshot.forEach((doc) => {
      channels.push(doc.data() as YouTubeChannel);
    });
    callback(channels);
  }, (err: any) => {
    console.warn('[ProjectService] Channel indexed subscription failed, falling back:', err?.message);
    unsub();
    const simpleQ = query(collection(db, 'channels'), where('userId', '==', userId));
    onSnapshot(simpleQ, (snap) => {
      const channels: YouTubeChannel[] = [];
      snap.forEach(d => channels.push(d.data() as YouTubeChannel));
      channels.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(channels);
    }, (err2) => {
      console.warn('[ProjectService] Simple channel subscription failed:', err2);
      callback(getLocalChannels());
    });
  });

  return unsub;
};

export const getChannel = async (channelId: string): Promise<YouTubeChannel | null> => {
  if (!isFirebaseConfigured()) return null;
  try {
    const docSnap = await getDoc(doc(db, 'channels', channelId));
    return docSnap.exists() ? docSnap.data() as YouTubeChannel : null;
  } catch (e) {
    return null;
  }
};

export const subscribeToAllProjectsAdmin = (callback: (projects: Project[]) => void) => {
  if (!isFirebaseConfigured()) {
    callback(getLocalProjects().map(row => mapRowToProject(row.id, row)));
    return () => { };
  }

  const q = query(collection(db, 'projects'), orderBy('created_at', 'desc'), limit(100));
  return onSnapshot(q, (querySnapshot) => {
    const projects: Project[] = [];
    querySnapshot.forEach((doc) => {
      projects.push(mapRowToProject(doc.id, doc.data()));
    });
    callback(projects);
  }, (err) => {
    console.warn("Admin project subscription error:", err);
  });
};

export const fetchProjectStatsAdmin = async (): Promise<{ totalCost: number, totalFailed: number, totalCount: number, activeUsers: number }> => {
  if (!isFirebaseConfigured()) return { totalCost: 0, totalFailed: 0, totalCount: 0, activeUsers: 0 };

  try {
    const querySnapshot = await getDocs(collection(db, 'projects'));
    const data = querySnapshot.docs.map(doc => doc.data());

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

  if (!isFirebaseConfigured()) {
    return getLocalProjects().map(row => mapRowToProject(row.id, row));
  }

  try {
    const q = query(collection(db, 'projects'), orderBy('created_at', 'desc'), limit(100));
    const querySnapshot = await getDocs(q);

    const projects: Project[] = [];
    for (const docSnapshot of querySnapshot.docs) {
      const data = docSnapshot.data();
      // In Firestore, we'd need a separate fetch for profiles or denormalize email
      projects.push(mapRowToProject(docSnapshot.id, data));
    }

    adminProjectsCache = { data: projects, timestamp: Date.now() };
    return projects;

  } catch (e: any) {
    console.warn("Fetch Admin Projects Failed:", e);
    return [];
  }
};

export const deductCredits = async (userId: string, amount: number): Promise<number | null> => {
  if (!isFirebaseConfigured()) return null;

  try {
    return await runTransaction(db, async (transaction) => {
      const docRef = doc(db, 'profiles', userId);
      const docSnap = await transaction.get(docRef);

      if (!docSnap.exists()) throw new Error("Profile not found.");

      const currentBalance = docSnap.data().credits_balance ?? 0;
      if (currentBalance < amount) throw new Error("Insufficient credits.");

      const newBalance = currentBalance - amount;
      transaction.update(docRef, { credits_balance: newBalance });
      return newBalance;
    });
  } catch (e) {
    console.error("Error deducting credits:", e);
    return null;
  }
};

export const refundCredits = async (userId: string, amount: number): Promise<number | null> => {
  return addCredits(userId, amount);
};

export const addCredits = async (userId: string, amount: number): Promise<number | null> => {
  if (!isFirebaseConfigured()) return null;

  try {
    const docRef = doc(db, 'profiles', userId);
    await updateDoc(docRef, {
      credits_balance: increment(amount)
    });

    const docSnap = await getDoc(docRef);
    return docSnap.data()?.credits_balance || null;
  } catch (e) {
    console.error("Error adding credits:", e);
    return null;
  }
};

export const saveProject = async (project: Project) => {
  if (!isFirebaseConfigured()) {
    saveToLocalStorage(project);
    const webhookUrl = localStorage.getItem('loopgenie_webhook_url') || undefined;
    triggerWebhook(webhookUrl, project);
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    saveToLocalStorage(project);
    return;
  }

  const payload = {
    user_id: user.uid,
    user_email: user.email,
    template_id: project.templateId || 'unknown_template',
    template_name: project.templateName || 'Untitled',
    thumbnail_url: project.thumbnailUrl,
    status: project.status,
    video_url: project.videoUrl,
    error: project.error,
    created_at: project.createdAt,
    project_type: project.type || 'AVATAR',
    cost: project.cost ?? 1,
    metadata: project.metadata
  };

  try {
    await setDoc(doc(db, 'projects', project.id), payload, { merge: true });
  } catch (error) {
    console.error("Save Project Firestore Error:", error);
    saveToLocalStorage(project);
  }

  // Handle Webhook notification on save
  if (project.status === ProjectStatus.COMPLETED || project.status === ProjectStatus.FAILED) {
    const webhookUrl = await getUserWebhookUrl(user.uid);
    triggerWebhook(webhookUrl, project);
  }
};

export const updateProjectStatus = async (id: string, updates: Partial<Project>) => {
  if (!isFirebaseConfigured()) {
    const projects = getLocalProjects();
    const index = projects.findIndex((p: any) => p.id === id);
    if (index >= 0) {
      if (updates.status) projects[index].status = updates.status;
      if (updates.videoUrl) projects[index].video_url = updates.videoUrl;
      if (updates.thumbnailUrl) projects[index].thumbnail_url = updates.thumbnailUrl;
      if (updates.error) projects[index].error = updates.error;
      saveLocalProjects(projects);

      const fullProject = mapRowToProject(id, projects[index]);
      const webhookUrl = localStorage.getItem('loopgenie_webhook_url') || undefined;
      triggerWebhook(webhookUrl, fullProject);
    }
    return;
  }

  try {
    const docRef = doc(db, 'projects', id);
    await updateDoc(docRef, updates);

    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const fullProject = mapRowToProject(id, docSnap.data());
      if (fullProject.status === ProjectStatus.COMPLETED || fullProject.status === ProjectStatus.FAILED) {
        const webhookUrl = await getUserWebhookUrl(docSnap.data().user_id);
        triggerWebhook(webhookUrl, fullProject);
      }
    }
  } catch (error) {
    console.error("Update Project Status Error:", error);
  }
};
