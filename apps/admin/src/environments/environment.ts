// The anon key is publishable (it can do nothing against RLS-locked tables);
// the service-role key must NEVER appear here.
export const environment = {
  apiUrl: 'http://localhost:4000',
  webUrl: 'http://localhost:3001',
  supabaseUrl: 'https://wozxytsihwjugbviuxsj.supabase.co',
  // Paste the anon/publishable key (dashboard → Settings → API Keys). It is safe in a client bundle.
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indvenh5dHNpaHdqdWdidml1eHNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NjI2NDcsImV4cCI6MjA5OTEzODY0N30.pJ7GX0GMn-_n4XmW0fHPe_b0n0aJtAds727vh0US_nE',
};
