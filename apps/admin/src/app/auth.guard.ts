import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { SupabaseService } from './services/supabase.service';

export const authGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  // Wait for the initial getSession() before deciding.
  const token = await supabase.accessToken();
  return token ? true : router.createUrlTree(['/login']);
};
