

export enum AppView {
  TEMPLATES = 'TEMPLATES',
  PROJECTS = 'PROJECTS',
  ASSETS = 'ASSETS',
  SETTINGS = 'SETTINGS',
  HELP = 'HELP'
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
  mode?: 'AVATAR' | 'COMPOSITION' | 'SHORTS' | 'STORYBOOK' | 'UGC_PRODUCT' | 'TEXT_TO_VIDEO' | 'AUDIOBOOK' | 'IMAGE_TO_VIDEO'; // Distinguish editor modes
}

export interface Project {
  id: string;
  templateId: string;
  templateName: string;
  thumbnailUrl: string;
  status: ProjectStatus;
  createdAt: number;
  videoUrl?: string; // This can also store Audio URL for audiobooks
  error?: string;
  type?: 'AVATAR' | 'UGC_PRODUCT' | 'TEXT_TO_VIDEO' | 'COMPOSITION' | 'SHORTS' | 'STORYBOOK' | 'AUDIOBOOK' | 'IMAGE_TO_VIDEO'; // Track the type of project
  cost?: number; // Cost in credits
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
  previewAudio?: string; // URL to audio sample
}

export interface ScriptGenerationRequest {
  topic: string;
  tone: string;
  templateVariables: TemplateVariable[];
}

// --- Composition Editor Types ---

export type ElementType = 'text' | 'image' | 'video' | 'audio' | 'shape';

export interface CompositionElement {
  id: string;
  type: ElementType;
  name: string;
  track: number; // Vertical stacking order (1 is bottom)
  startTime: number; // Seconds
  duration: number; // Seconds
  
  // Visual Properties (Percentages 0-100 for responsiveness)
  x: number; 
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  
  // Content
  text?: string;
  src?: string; // For image/video/audio
  
  // Style
  fillColor?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: 'left' | 'center' | 'right';
  zIndex?: number;
}

export interface CompositionState {
  name: string;
  width: number;
  height: number;
  duration: number;
  elements: CompositionElement[];
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
  // Generated Assets
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
  // Generated Assets
  generated_audio_url?: string;
  generated_video_url?: string;
  status?: "created" | "story_ready" | "images_processing" | "audio_processing" | "assembling" | "completed" | "failed";
}

// Interface for the AI Studio key selection global
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}