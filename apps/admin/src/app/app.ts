import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SupabaseService } from './services/supabase.service';
import { MeService } from './services/me.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly supabase = inject(SupabaseService);
  protected readonly meService = inject(MeService);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      if (this.supabase.session()) {
        this.meService.load();
      } else {
        this.meService.reset();
      }
    });
  }

  protected async signOut(): Promise<void> {
    await this.supabase.signOut();
    this.meService.reset();
    this.router.navigate(['/login']);
  }
}
