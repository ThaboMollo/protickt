import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="card" style="max-width: 420px; margin: 3rem auto;">
      <h1>Sign in</h1>
      <form #f="ngForm" (ngSubmit)="submit(f)">
        <label for="email" class="required">Email</label>
        <input id="email" type="email" name="email" [(ngModel)]="email" #emailCtl="ngModel" required email />
        @if (emailCtl.errors?.['email'] && emailCtl.touched) {
          <p class="field-error">Enter a valid email address</p>
        }

        <label for="password" class="required">Password</label>
        <input
          id="password"
          type="password"
          name="password"
          [(ngModel)]="password"
          required
        />

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }

        <button class="primary" type="submit" [disabled]="busy()" style="width: 100%">
          {{ busy() ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </div>
  `,
})
export class LoginPage {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  protected email = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.form.markAllAsTouched();
      this.error.set('Please fill in the highlighted fields.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const message = await this.supabase.signIn(this.email, this.password);
    this.busy.set(false);
    if (message) {
      this.error.set(message);
      return;
    }
    this.router.navigate(['/events']);
  }
}
