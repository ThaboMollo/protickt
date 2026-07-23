import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DEFAULT_THEME,
  LOGO_CONTENT_TYPES,
  ORG_ASSETS_BUCKET,
  SUPPORTED_CURRENCIES,
  type AdminRole,
  type Currency,
  type LogoContentType,
  type OrgInput,
  type TenantTheme,
} from '@protickt/shared';
import { ApiService } from '../../services/api.service';
import { SupabaseService } from '../../services/supabase.service';

const THEME_LABELS: Record<keyof Required<TenantTheme>, string> = {
  accent: 'Accent',
  accent2: 'Accent 2 (gradient)',
  bg: 'Background',
  card: 'Card',
  cardInset: 'Card inset',
  border: 'Border',
  ink: 'Text',
  muted: 'Muted text',
  ok: 'Success',
  bad: 'Error',
};

@Component({
  selector: 'app-org-form',
  imports: [FormsModule],
  template: `
    <h1>{{ orgId ? 'Edit organization' : 'New organization' }}</h1>

    <div class="card">
      @if (loading()) {
        @for (i of skeletonFields; track $index) {
          <div class="skeleton skeleton-label"></div>
          <div class="skeleton skeleton-input"></div>
        }
      } @else {
      <form #f="ngForm" (ngSubmit)="submit(f)">
        <label for="name" class="required">Organization name (shown on their site and emails)</label>
        <input id="name" name="name" [(ngModel)]="name" required (input)="suggestSlug()" />

        <label for="slug" class="required">Tenant slug (used in webhook URL and site config)</label>
        <input id="slug" name="slug" [(ngModel)]="slug" #slugCtl="ngModel" required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        @if (slugCtl.errors?.['pattern'] && slugCtl.touched) {
          <p class="field-error">Lowercase letters, numbers and dashes only (e.g. wild-media)</p>
        }

        <label for="site_url" class="required">Buyer site URL (their domain, no trailing slash)</label>
        <input id="site_url" name="site_url" type="url" [(ngModel)]="siteUrl" #siteUrlCtl="ngModel" required pattern="https?://.+" placeholder="https://tickets.example.com" />
        @if (siteUrlCtl.errors?.['pattern'] && siteUrlCtl.touched) {
          <p class="field-error">Must be a full URL starting with https://</p>
        }

        <label for="logo">Logo (shown in the site header; SVG, PNG, JPEG or WebP)</label>
        @if (logoUrl && !logoFile) {
          <p class="meta">
            <a [href]="logoUrl" target="_blank">Current logo ↗</a>
            <button type="button" class="secondary" (click)="logoUrl = null">Remove</button>
          </p>
        }
        <input id="logo" name="logo" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" (change)="onLogoChange($event)" />

        <label for="support_email">Support email (buyers reply here)</label>
        <input id="support_email" name="support_email" type="email" [(ngModel)]="supportEmail" #supportEmailCtl="ngModel" email />
        @if (supportEmailCtl.errors?.['email'] && supportEmailCtl.touched) {
          <p class="field-error">Enter a valid email address</p>
        }

        <label for="support_phone">Support phone</label>
        <input id="support_phone" name="support_phone" type="tel" [(ngModel)]="supportPhone" />

        <label for="default_currency">Default currency for new events</label>
        <select id="default_currency" name="default_currency" [(ngModel)]="defaultCurrency">
          @for (code of currencies; track code) {
            <option [value]="code">{{ code }}</option>
          }
        </select>

        <h2>Theme</h2>
        <p class="meta">Colours go live on the tenant site within ~5 minutes of saving — no redeploy.</p>
        <div class="theme-grid">
          @for (key of themeKeys; track key) {
            <label class="theme-swatch">
              <input type="color" [name]="'theme_' + key" [(ngModel)]="theme[key]" />
              {{ themeLabels[key] }}
            </label>
          }
        </div>

        <h2>Socials</h2>
        @for (network of socialKeys; track network) {
          <label [for]="'social_' + network">{{ network }}</label>
          <input [id]="'social_' + network" [name]="'social_' + network" type="url" [(ngModel)]="socials[network]" placeholder="https://…" />
        }

        @if (orgId) {
          <label for="status">Status</label>
          <select id="status" name="status" [(ngModel)]="status">
            <option value="active">Active</option>
            <option value="suspended">Suspended (site and checkout offline)</option>
          </select>
        }

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }

        <button class="primary" type="submit" [disabled]="busy()">
          {{ busy() ? 'Saving…' : orgId ? 'Save changes' : 'Create organization' }}
        </button>
      </form>
      }
    </div>

    @if (orgId) {
      <div class="card">
        <h2>Paystack keys</h2>
        <p class="meta">
          The client's own Paystack API keys — ticket revenue settles straight into
          their Paystack account. Keys are write-only: they can be replaced but never
          read back.
          @if (hasPaystackKeys()) {
            <span class="badge published">keys set</span>
          } @else {
            <span class="badge draft">no keys yet</span>
          }
        </p>
        <form #kf="ngForm" (ngSubmit)="saveKeys(kf)">
          <label for="secret_key" class="required">Secret key (sk_…)</label>
          <input id="secret_key" name="secret_key" type="password" [(ngModel)]="secretKey" #secretCtl="ngModel" required pattern="sk_.+" autocomplete="off" />
          @if (secretCtl.errors?.['pattern'] && secretCtl.touched) {
            <p class="field-error">Secret keys start with sk_</p>
          }
          <label for="public_key" class="required">Public key (pk_…)</label>
          <input id="public_key" name="public_key" type="password" [(ngModel)]="publicKey" #publicCtl="ngModel" required pattern="pk_.+" autocomplete="off" />
          @if (publicCtl.errors?.['pattern'] && publicCtl.touched) {
            <p class="field-error">Public keys start with pk_</p>
          }
          @if (keysError()) {
            <p class="error">{{ keysError() }}</p>
          }
          @if (keysSaved()) {
            <p class="meta">✓ Keys saved. Remind the client to set their Paystack webhook URL to <code>{{ webhookUrl }}</code></p>
          }
          <button class="primary" type="submit" [disabled]="keysBusy()">
            {{ keysBusy() ? 'Saving…' : 'Save keys' }}
          </button>
        </form>
      </div>

      <div class="card">
        <h2>Admin users</h2>
        <p class="meta">
          They sign up on this admin app's login page first, then get added here by email.
        </p>
        @if (admins().length > 0) {
          <table>
            <thead><tr><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              @for (admin of admins(); track admin.user_id) {
                <tr>
                  <td>{{ admin.email ?? admin.user_id }}</td>
                  <td>{{ admin.role }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
        <form #af="ngForm" (ngSubmit)="addAdmin(af)">
          <label for="admin_email" class="required">Add admin by email</label>
          <input id="admin_email" name="admin_email" type="email" [(ngModel)]="adminEmail" #adminEmailCtl="ngModel" required email />
          @if (adminEmailCtl.errors?.['email'] && adminEmailCtl.touched) {
            <p class="field-error">Enter a valid email address</p>
          }
          @if (adminError()) {
            <p class="error">{{ adminError() }}</p>
          }
          <button class="primary" type="submit" [disabled]="adminBusy()">
            {{ adminBusy() ? 'Adding…' : 'Add admin' }}
          </button>
        </form>
      </div>
    }
  `,
  styles: `
    .theme-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .theme-swatch {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
    }
    .theme-swatch input[type='color'] {
      width: 2.2rem;
      height: 2.2rem;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
    }
  `,
})
export class OrgFormPage {
  private readonly api = inject(ApiService);
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  protected readonly orgId: string | null =
    inject(ActivatedRoute).snapshot.paramMap.get('id');

  protected readonly currencies = SUPPORTED_CURRENCIES;
  protected readonly themeKeys = Object.keys(THEME_LABELS) as (keyof Required<TenantTheme>)[];
  protected readonly themeLabels = THEME_LABELS;
  protected readonly socialKeys = ['instagram', 'facebook', 'x', 'tiktok', 'website'] as const;

  protected name = '';
  protected slug = '';
  protected siteUrl = '';
  protected logoUrl: string | null = null;
  protected logoFile: File | null = null;
  protected supportEmail = '';
  protected supportPhone = '';
  protected defaultCurrency: Currency = 'ZAR';
  protected status: 'active' | 'suspended' = 'active';
  protected theme: Required<TenantTheme> = { ...DEFAULT_THEME };
  protected socials: Record<string, string> = {};

  protected secretKey = '';
  protected publicKey = '';
  protected adminEmail = '';

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Editing: skeleton until the org arrives; the signal flip re-renders the
   *  form with populated inputs (zoneless CD ignores bare promise writes). */
  protected readonly loading = signal(false);
  protected readonly skeletonFields = Array.from({ length: 8 });
  protected readonly hasPaystackKeys = signal(false);
  protected readonly keysBusy = signal(false);
  protected readonly keysError = signal<string | null>(null);
  protected readonly keysSaved = signal(false);
  protected readonly admins = signal<
    { user_id: string; role: AdminRole; email: string | null; created_at: string }[]
  >([]);
  protected readonly adminBusy = signal(false);
  protected readonly adminError = signal<string | null>(null);

  private slugTouched = false;

  constructor() {
    if (this.orgId) {
      this.slugTouched = true;
      this.loading.set(true);
      this.api
        .listOrgs()
        .then((orgs) => {
          const org = orgs.find((o) => o.id === this.orgId);
          if (!org) {
            this.error.set('Organization not found');
            return;
          }
          this.name = org.name;
          this.slug = org.slug;
          this.siteUrl = org.site_url;
          this.logoUrl = org.logo_url;
          this.supportEmail = org.support_email ?? '';
          this.supportPhone = org.support_phone ?? '';
          this.defaultCurrency = org.default_currency as Currency;
          this.status = org.status;
          this.theme = { ...DEFAULT_THEME, ...org.theme };
          this.socials = { ...org.socials };
          this.hasPaystackKeys.set(org.has_paystack_keys);
        })
        .catch((err: Error) => this.error.set(err.message))
        .finally(() => this.loading.set(false));
      this.api.listOrgAdmins(this.orgId).then((admins) => this.admins.set(admins));
    }
  }

  protected get webhookUrl(): string {
    return `https://protickt-api.vercel.app/webhooks/paystack/${this.slug}`;
  }

  protected suggestSlug(): void {
    if (this.slugTouched && this.orgId) return;
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  protected onLogoChange(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0] ?? null;
    if (file && !LOGO_CONTENT_TYPES.includes(file.type as LogoContentType)) {
      this.error.set('Logo must be a JPEG, PNG, WebP or SVG file');
      inputEl.value = '';
      this.logoFile = null;
      return;
    }
    this.error.set(null);
    this.logoFile = file;
  }

  protected async submit(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.form.markAllAsTouched();
      this.error.set('Please fill in the required fields highlighted above.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);

    const socials = Object.fromEntries(
      Object.entries(this.socials).filter(([, url]) => url),
    );
    const input: OrgInput = {
      name: this.name,
      slug: this.slug,
      site_url: this.siteUrl.replace(/\/$/, ''),
      logo_url: this.logoUrl,
      support_email: this.supportEmail || null,
      support_phone: this.supportPhone || null,
      socials,
      theme: this.theme,
      default_currency: this.defaultCurrency,
      status: this.status,
    };

    try {
      const saved = this.orgId
        ? await this.api.updateOrg(this.orgId, input)
        : await this.api.createOrg(input);

      if (this.logoFile) {
        await this.uploadLogo(saved.id, this.logoFile);
      }

      this.router.navigate(['/orgs']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to save organization');
      this.busy.set(false);
    }
  }

  private async uploadLogo(orgId: string, file: File): Promise<void> {
    const { path, token, public_url } = await this.api.createLogoUploadUrl(
      orgId,
      file.type as LogoContentType,
    );
    const uploadError = await this.supabase.uploadSigned(
      ORG_ASSETS_BUCKET,
      path,
      token,
      file,
    );
    if (uploadError) {
      throw new Error(`Organization saved, but the logo upload failed: ${uploadError}`);
    }
    await this.api.updateOrg(orgId, { logo_url: public_url });
  }

  protected async saveKeys(form: NgForm): Promise<void> {
    if (!this.orgId) return;
    if (form.invalid) {
      form.form.markAllAsTouched();
      this.keysError.set('Both Paystack keys are required.');
      return;
    }
    this.keysBusy.set(true);
    this.keysError.set(null);
    this.keysSaved.set(false);
    try {
      const org = await this.api.setOrgPaystackKeys(this.orgId, {
        secret_key: this.secretKey,
        public_key: this.publicKey,
      });
      this.hasPaystackKeys.set(org.has_paystack_keys);
      this.secretKey = '';
      this.publicKey = '';
      this.keysSaved.set(true);
    } catch (err) {
      this.keysError.set(err instanceof Error ? err.message : 'Failed to save keys');
    } finally {
      this.keysBusy.set(false);
    }
  }

  protected async addAdmin(form: NgForm): Promise<void> {
    if (!this.orgId) return;
    if (form.invalid) {
      form.form.markAllAsTouched();
      this.adminError.set('An email address is required.');
      return;
    }
    this.adminBusy.set(true);
    this.adminError.set(null);
    try {
      await this.api.addOrgAdmin(this.orgId, this.adminEmail, 'org_admin');
      this.adminEmail = '';
      this.admins.set(await this.api.listOrgAdmins(this.orgId));
    } catch (err) {
      this.adminError.set(err instanceof Error ? err.message : 'Failed to add admin');
    } finally {
      this.adminBusy.set(false);
    }
  }
}
