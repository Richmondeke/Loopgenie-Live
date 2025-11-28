
import { Project, ProjectStatus, HeyGenAvatar, HeyGenVoice, Template } from "../types";

const HEYGEN_API_BASE = "https://api.heygen.com/v2";

const fetchAPI = async (endpoint: string, apiKey: string, options: RequestInit = {}) => {
  const res = await fetch(`${HEYGEN_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
      ...options.headers,
    }
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.message || `API Error: ${res.statusText}`);
  }
  return res.json();
}

// Simple in-memory cache
interface Cache<T> {
    data: T;
    apiKey: string;
}

let avatarCache: Cache<HeyGenAvatar[]> | null = null;
let voiceCache: Cache<HeyGenVoice[]> | null = null;

// In "Strictly Avatar" mode, we primarily use getAvatars. 
// getTemplates is kept for backward compatibility or if we want to show generic templates later.
export const getTemplates = async (apiKey: string): Promise<Template[]> => {
  return []; // Disable generic template fetching to focus on Avatars
};

export const getTemplateDetail = async (apiKey: string, templateId: string): Promise<Template | null> => {
    return null; // Disable detail fetching
}

export const getAvatars = async (apiKey: string): Promise<HeyGenAvatar[]> => {
  if (!apiKey) return [];

  // Return cached data if available and key matches
  if (avatarCache && avatarCache.apiKey === apiKey && avatarCache.data.length > 0) {
      return avatarCache.data;
  }

  try {
    const response = await fetchAPI('/avatars', apiKey);
    const list = response.data?.avatars || response.data || [];
    const mapped = list.map((a: any) => ({
      id: a.avatar_id || a.id,
      name: a.name,
      gender: a.gender,
      previewUrl: a.preview_image_url || a.avatar_image_url || a.preview_url
    }));

    // Update cache
    avatarCache = {
        data: mapped,
        apiKey: apiKey
    };

    return mapped;
  } catch (e) {
    console.warn("Failed to fetch avatars:", e);
    return [];
  }
};

export const getVoices = async (apiKey: string): Promise<HeyGenVoice[]> => {
  if (!apiKey) return [];

  // Return cached data if available and key matches
  if (voiceCache && voiceCache.apiKey === apiKey && voiceCache.data.length > 0) {
      return voiceCache.data;
  }

  try {
    const response = await fetchAPI('/voices', apiKey);
    const list = response.data?.voices || response.data || [];
    const mapped = list.map((v: any) => ({
      id: v.voice_id || v.id,
      name: v.name,
      language: v.language,
      gender: v.gender,
      previewAudio: v.preview_audio
    }));

    // Update cache
    voiceCache = {
        data: mapped,
        apiKey: apiKey
    };

    return mapped;
  } catch (e) {
    console.warn("Failed to fetch voices:", e);
    return [];
  }
};

export const generateVideo = async (
  apiKey: string,
  templateId: string, 
  variables: Record<string, string>,
  avatarId?: string,
  voiceId?: string,
  dimension?: { width: number, height: number }
): Promise<string> => {
  // Strict check for API Key in production
  if (!apiKey) {
    throw new Error("HeyGen API Key is required to generate videos.");
  }

  // Real API implementation using v2/video/generate (Avatar Video)
  try {
    const script = variables.script || "Hello, this is a generated video.";
    
    // Default to 16:9 if not provided
    const dim = dimension || { width: 1280, height: 720 };

    const body = {
        video_inputs: [
            {
                character: {
                    type: "avatar",
                    avatar_id: avatarId,
                    avatar_style: "normal"
                },
                voice: {
                    type: "text",
                    input_text: script,
                    voice_id: voiceId
                },
                background: {
                    type: "color",
                    value: "#F9FAFB" // Clean gray/white background
                }
            }
        ],
        dimension: dim,
        test: false // PRODUCTION: Set test to false
    };

    const response = await fetch(`${HEYGEN_API_BASE}/video/generate`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Api-Key": apiKey 
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "HeyGen API Request Failed");
    }

    const data = await response.json();
    return data.data.video_id || data.data.job_id; 
  } catch (error) {
    console.error("HeyGen API Error:", error);
    throw error;
  }
};

export interface VideoStatusResponse {
  status: ProjectStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export const checkVideoStatus = async (
  apiKey: string,
  jobId: string
): Promise<VideoStatusResponse> => {
  if (!apiKey) return { status: ProjectStatus.PENDING };

  try {
    // FIX: Using V1 endpoint for status check as it is more reliable/standard for simple status polling
    const response = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${jobId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "X-Api-Key": apiKey,
        "Accept": "application/json"
      }
    });
    
    if (!response.ok) {
        console.warn(`Status check failed for ${jobId}: ${response.statusText}`);
        return { status: ProjectStatus.PENDING }; // Keep polling
    }
    
    const data = await response.json();
    const statusStr = data.data.status; 
    const videoUrl = data.data.video_url || data.data.url;
    const thumbnailUrl = data.data.thumbnail_url;
    
    // Fix: Only process error if it exists and is not null
    const errorRaw = data.data.error;
    let errorMsg: string | undefined = undefined;
    if (errorRaw) {
        errorMsg = typeof errorRaw === 'string' ? errorRaw : JSON.stringify(errorRaw);
        // Sometimes API returns "null" string or object { code: ... }
        if (errorMsg === 'null' || errorMsg === '{}') errorMsg = undefined;
    }

    let status = ProjectStatus.PENDING;
    if (statusStr === 'completed') status = ProjectStatus.COMPLETED;
    else if (statusStr === 'processing' || statusStr === 'waiting') status = ProjectStatus.PROCESSING;
    else if (statusStr === 'failed') status = ProjectStatus.FAILED;

    return {
        status,
        videoUrl,
        thumbnailUrl,
        error: errorMsg
    };
  } catch (error) {
    console.warn("Network error during status check, retrying next poll", error);
    return { status: ProjectStatus.PENDING };
  }
};
