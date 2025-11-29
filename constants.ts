
import { Template, HeyGenAvatar, HeyGenVoice } from './types';

export const DEFAULT_HEYGEN_API_KEY = 'sk_V2_hgu_kBihe5QbIIG_p27AdJG5h2c4nHiPds9jt5OZvLRVFadb';

// Default Gemini API Keys pool. 
// The app will use this key if process.env.API_KEY is not set.
// SECURITY WARNING: This key is exposed in the client bundle.
// YOU MUST RESTRICT THIS KEY in Google Cloud Console > APIs & Services > Credentials > Application restrictions > HTTP referrers.
export const GEMINI_API_KEYS: string[] = [
    "AIzaSyDnF2TkbZwdo-9dacNgRqdaNz6oWU0ueNY",
];

// We use these as "Featured Avatars" or fallback if API fails
export const MOCK_TEMPLATES: Template[] = [
  {
    id: 'preset_news',
    name: 'Professional Anchor',
    category: 'Business',
    thumbnailUrl: 'https://files.heygen.ai/avatar/v3/99e6900609314486a60d62512330768e/full/preview_target.webp', // Placeholder
    defaultAvatarId: 'avatar_news_anchor',
    defaultVoiceId: 'voice_us_male_1',
    variables: [
      { key: 'script', label: 'Script', type: 'textarea', placeholder: 'Good evening, tonight\'s top story is...' }
    ]
  },
  {
    id: 'preset_creative',
    name: 'Creative Storyteller',
    category: 'Social',
    thumbnailUrl: 'https://files.heygen.ai/avatar/v3/48c7f3e8082643a6939634e908616147/full/preview_target.webp', // Placeholder
    defaultAvatarId: 'avatar_influencer',
    defaultVoiceId: 'voice_us_female_1',
    variables: [
      { key: 'script', label: 'Script', type: 'textarea', placeholder: 'Hey guys! You won\'t believe what I found today...' }
    ]
  },
  {
    id: 'preset_educator',
    name: 'Online Educator',
    category: 'Education',
    thumbnailUrl: 'https://files.heygen.ai/avatar/v3/c9e9927906054854932064df19973216/full/preview_target.webp', // Placeholder
    defaultAvatarId: 'avatar_trainer',
    defaultVoiceId: 'voice_uk_male_1',
    variables: [
      { key: 'script', label: 'Script', type: 'textarea', placeholder: 'Welcome to today\'s lesson on quantum physics...' }
    ]
  }
];

export const MOCK_AVATARS: HeyGenAvatar[] = [
  { id: 'avatar_news_anchor', name: 'Joshua (News)', gender: 'male', previewUrl: 'https://files.heygen.ai/avatar/v3/99e6900609314486a60d62512330768e/full/preview_target.webp' },
  { id: 'avatar_marketer', name: 'Sarah (Pro)', gender: 'female', previewUrl: 'https://files.heygen.ai/avatar/v3/c9e9927906054854932064df19973216/full/preview_target.webp' },
  { id: 'avatar_trainer', name: 'David (Casual)', gender: 'male', previewUrl: 'https://files.heygen.ai/avatar/v3/48c7f3e8082643a6939634e908616147/full/preview_target.webp' },
  { id: 'avatar_influencer', name: 'Mila (Expressive)', gender: 'female', previewUrl: 'https://files.heygen.ai/avatar/v3/552a48d8883648a8835848c403309a4f/full/preview_target.webp' },
];

export const MOCK_VOICES: HeyGenVoice[] = [
  // Using more reliable MP3 sources for testing
  { id: 'voice_us_male_1', name: 'Joey (US)', language: 'English', gender: 'male', previewAudio: 'https://www2.cs.uic.edu/~i101/SoundFiles/BabyElephantWalk60.wav' },
  { id: 'voice_us_female_1', name: 'Amber (US)', language: 'English', gender: 'female', previewAudio: 'https://www2.cs.uic.edu/~i101/SoundFiles/StarWars3.wav' },
  { id: 'voice_uk_male_1', name: 'Oliver (UK)', language: 'English', gender: 'male', previewAudio: 'https://www2.cs.uic.edu/~i101/SoundFiles/CantinaBand3.wav' },
  { id: 'voice_uk_female_1', name: 'Sonia (UK)', language: 'English', gender: 'female', previewAudio: 'https://www2.cs.uic.edu/~i101/SoundFiles/PinkPanther30.wav' },
];
