import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { MeService } from './services/me.service';

/** Org management is proTickt-staff territory; org admins get bounced home. */
export const superAdminGuard: CanActivateFn = async () => {
  const me = await inject(MeService).load();
  return me?.role === 'super_admin' ? true : inject(Router).parseUrl('/events');
};
