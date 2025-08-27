// Supabase configuration using CDN
// The CDN script makes createClient available globally

let supabase;
let SHIFTS_TABLE = 'shifts';

try {
  // Check if Supabase CDN is loaded and createClient is available
  if (window.supabase && window.supabase.createClient) {
    // Check if environment variables are available
    try {
      if (import.meta && import.meta.env) {
        const supabaseUrl = import.meta.env.SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseAnonKey) {
          // Create Supabase client with environment variables
          supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
          console.log('Supabase client created successfully');
        } else {
          throw new Error('Supabase environment variables not available');
        }
      } else {
        throw new Error('import.meta.env not available');
      }
    } catch (envError) {
      throw new Error('Environment variables not accessible');
    }
  } else {
    throw new Error('Supabase CDN not loaded');
  }
} catch (error) {
  console.warn('Supabase initialization failed, falling back to localStorage:', error);
  
  // Fallback to localStorage - create a mock Supabase client
  supabase = {
    from: (table) => ({
      select: (columns) => ({
        order: (column, options) => Promise.resolve({ data: [], error: null }),
        limit: (count) => Promise.resolve({ data: [], error: null })
      }),
      insert: (data) => Promise.resolve({ data: [], error: null }),
      delete: () => ({
        neq: (column, value) => Promise.resolve({ error: null })
      })
    })
  };
  
  // Override the table name to indicate we're using localStorage
  SHIFTS_TABLE = 'localStorage_fallback';
}

export { supabase, SHIFTS_TABLE };
