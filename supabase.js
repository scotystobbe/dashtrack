import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = import.meta.env.SUPABASE_URL || 'YOUR_SUPABASE_PROJECT_URL'
const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database table name
export const SHIFTS_TABLE = 'shifts'
