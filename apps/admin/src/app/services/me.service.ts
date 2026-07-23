import { Injectable, inject, signal } from '@angular/core';
import type { AdminMeResponse } from '@protickt/shared';
import { ApiService } from './api.service';

/** Who the signed-in admin is: role + organization. Loaded once per session. */
@Injectable({ providedIn: 'root' })
export class MeService {
  private readonly api = inject(ApiService);

  readonly me = signal<AdminMeResponse | null>(null);
  private pending: Promise<AdminMeResponse | null> | null = null;

  load(): Promise<AdminMeResponse | null> {
    this.pending ??= this.api
      .getMe()
      .then((me) => {
        this.me.set(me);
        return me;
      })
      .catch(() => null);
    return this.pending;
  }

  reset(): void {
    this.pending = null;
    this.me.set(null);
  }
}
