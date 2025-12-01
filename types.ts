
export enum AppView {
  TEMPLATES = 'TEMPLATES',
  PROJECTS = 'PROJECTS',
  ASSETS = 'ASSETS',
  SETTINGS = 'SETTINGS',
  HELP = 'HELP',
  ADMIN = 'ADMIN',
  ADMIN_USERS = 'ADMIN_USERS',
  INTEGRATIONS = 'INTEGRATIONS'
}

export enum ProjectStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  credits_balance: number;
  isAdmin?: boolean;
}

export interface TemplateVariable {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'image';
  placeholder?: string;
  defaultValue?: string;
}

export interface Template {
  id: string;
  name: string;
  thumbnailUrl: string;
  category: string;
  variables: TemplateVariable[];
  defaultAvatarId?: string;
  defaultVoiceId?: string;
  mode?: 'AVATAR' | 'FASHION_SHOOT' | 'SHORTS' | 'STORYBOOK' | 'UGC_PRODUCT' | 'TEXT_TO_VIDEO' | 'AUDIOBOOK' | 'IMAGE_TO_VIDEO'; 
}

export interface Project {
  id: string;
  templateId: string;
  templateName: string;
  thumbnailUrl: string;
  status: ProjectStatus;
  createdAt: number;
  videoUrl?: string; 
  error?: string;
  type?: 'AVATAR' | 'UGC_PRODUCT' | 'TEXT_TO_VIDEO' | 'FASHION_SHOOT' | 'SHORTS' | 'STORYBOOK' | 'AUDIOBOOK' | 'IMAGE_TO_VIDEO'; 
  cost?: number; 
  user_email?: string;
}

export interface HeyGenAvatar {
  id: string;
  name: string;
  previewUrl: string;
  gender: 'male' | 'female';
}

export interface HeyGenVoice {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female';
  previewAudio?: string;
}

export interface ScriptGenerationRequest {
  topic: string;
  tone: string;
  templateVariables: TemplateVariable[];
}

// --- ShortMaker Types ---

export interface ShortMakerOutputSettings {
  video_resolution: "1080x1920" | "1920x1080";
  fps: number;
  scene_duration_default: number;
}

export interface ShortMakerVoiceInstruction {
  voice: string;
  lang: string;
  tone: string;
}

export interface ShortMakerTimecodes {
  start_second: number;
  end_second: number;
}

export interface ShortMakerScene {
  scene_number: number;
  duration_seconds: number;
  narration_text: string;
  visual_description: string;
  character_tokens: string[];
  environment_tokens: string[];
  camera_directive: string;
  image_prompt: string;
  transition_to_next: string;
  timecodes: ShortMakerTimecodes;
  generated_image_url?: string;
  generated_image_seed?: string;
}

export interface ShortMakerManifest {
  project_id?: string;
  idea_input?: string;
  seed?: string;
  title: string;
  final_caption: string;
  voice_instruction: ShortMakerVoiceInstruction;
  output_settings: ShortMakerOutputSettings;
  scenes: ShortMakerScene[];
  generated_audio_url?: string;
  generated_video_url?: string;
  status?: "created" | "story_ready" | "images_processing" | "audio_processing" | "assembling" | "completed" | "failed";
}

// --- Social Integration Types ---
export interface ScheduledPost {
  id: string;
  content: string;
  platform: 'twitter' | 'linkedin' | 'instagram';
  scheduledAt: number; // Timestamp
  status: 'scheduled' | 'posted' | 'failed';
  mediaUrl?: string;
}

export interface IntegrationStatus {
  id: 'twitter' | 'linkedin' | 'instagram';
  name: string;
  connected: boolean;
  username?: string;
  avatarUrl?: string;
}

// --- CENTRALIZED COST CONFIGURATION ---
// Base assumption: 1 Credit = $0.10 USD
export const APP_COSTS = {
    AVATAR_VIDEO: 30,      // Provider: ~$2.00 -> Price: $3.00
    VEO_FAST: 8,           // Provider: ~$0.50 -> Price: $0.80
    VEO_PRO: 23,           // Provider: ~$1.50 -> Price: $2.30
    UGC_MULTI: 24,         // Provider: ~$1.60 -> Price: $2.40
    FASHION: 2,            // Provider: ~$0.10 -> Price: $0.20
    AUDIOBOOK: 5,          // Provider: ~$0.30 -> Price: $0.50
    SHORTS_15S: 5,         // Provider: ~$0.32 -> Price: $0.50
    SHORTS_30S: 9,         // Provider: ~$0.54 -> Price: $0.90
    SHORTS_60S: 16         // Provider: ~$1.03 -> Price: $1.60
};