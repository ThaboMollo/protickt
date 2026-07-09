// The anon key is publishable (it can do nothing against RLS-locked tables);
// the service-role key must NEVER appear here.
export const environment = {
  apiUrl: 'http://localhost:4000',
  webUrl: 'http://localhost:3000',
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
};
