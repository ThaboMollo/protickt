import { Injectable, signal } from '@angular/core';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * Supabase is used in the admin app for auth only — all data goes through
 * the Express API, which verifies the JWT this service produces.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
  );

  readonly session = signal<Session | null>(null);
  readonly ready = signal(false);

  constructor() {
    this.client.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
      this.ready.set(true);
    });
    this.client.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
    });
  }

  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async accessToken(): Promise<string | null> {
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }
}
