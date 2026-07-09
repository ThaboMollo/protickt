import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SupabaseService } from './services/supabase.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  protected async signOut(): Promise<void> {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}
