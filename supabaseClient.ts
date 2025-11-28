
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ysetjcltrfktdamldrnl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzZXRqY2x0cmZrdGRhbWxkcm5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMzY3OTAsImV4cCI6MjA3OTcxMjc5MH0.bRNhG_WRZ2CXvYXCq8wT5i7zPm35z7vZ8UtIBNX07YA';

// Check if properly configured
const isConfigured = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

if (!isConfigured) {
  console.warn("Supabase URL and Anon Key are missing. App will run in Local/Mock mode.");
}

// Initialize with provided credentials
export const supabase = createClient(
    SUPABASE_URL, 
    SUPABASE_ANON_KEY
);

export const isSupabaseConfigured = () => isConfigured;
