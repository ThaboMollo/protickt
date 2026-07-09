// Production config — baked in at build time by the `fileReplacements` rule
// in angular.json. Update the URLs after the first Vercel deploy (or once
// custom domains are attached).
export const environment = {
  apiUrl: 'https://protickt-api.vercel.app',
  webUrl: 'https://protickt-web.vercel.app',
  supabaseUrl: 'https://wozxytsihwjugbviuxsj.supabase.co',
  // Publishable anon key — safe in a client bundle (RLS blocks it from everything).
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indvenh5dHNpaHdqdWdidml1eHNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NjI2NDcsImV4cCI6MjA5OTEzODY0N30.pJ7GX0GMn-_n4XmW0fHPe_b0n0aJtAds727vh0US_nE',
};
