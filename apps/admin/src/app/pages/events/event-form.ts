import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FLYER_CONTENT_TYPES,
  SUPPORTED_CURRENCIES,
  type Currency,
  type EventInput,
  type FlyerContentType,
  type OrganizationRecord,
} from '@protickt/shared';
import { ApiService } from '../../services/api.service';
import { SupabaseService } from '../../services/supabase.service';
import { MeService } from '../../services/me.service';

@Component({
  selector: 'app-event-form',
  imports: [FormsModule],
  template: `
    <h1>{{ eventId ? 'Edit event' : 'New event' }}</h1>

    <div class="card">
      @if (loading()) {
        @for (i of skeletonFields; track $index) {
          <div class="skeleton skeleton-label"></div>
          <div class="skeleton skeleton-input"></div>
        }
      } @else {
      <form #f="ngForm" (ngSubmit)="submit(f)">
        @if (!eventId && orgs().length > 0) {
          <label for="organization">Organization (whose site sells this event)</label>
          <select id="organization" name="organization" [(ngModel)]="organizationId">
            @for (org of orgs(); track org.id) {
              <option [value]="org.id">{{ org.name }}</option>
            }
          </select>
        }

        <label for="name" class="required">Event name</label>
        <input id="name" name="name" [(ngModel)]="name" required (input)="suggestSlug()" />

        <label for="slug" class="required">Link slug (protickt.app/e/…)</label>
        <input id="slug" name="slug" [(ngModel)]="slug" #slugCtl="ngModel" required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        @if (slugCtl.errors?.['pattern'] && slugCtl.touched) {
          <p class="field-error">Lowercase letters, numbers and dashes only (e.g. my-event)</p>
        }

        <label for="description">Description</label>
        <textarea id="description" name="description" rows="4" [(ngModel)]="description"></textarea>

        <label for="venue">Venue</label>
        <input id="venue" name="venue" [(ngModel)]="venue" />

        <label for="starts_at" class="required">Starts at</label>
        <input id="starts_at" name="starts_at" type="datetime-local" [(ngModel)]="startsAt" required />

        <label for="currency">Currency</label>
        <select id="currency" name="currency" [(ngModel)]="currency">
          @for (code of currencies; track code) {
            <option [value]="code">{{ code }}</option>
          }
        </select>

        <label for="price" class="required">Ticket price ({{ currency }}, 0 = free)</label>
        <input id="price" name="price" type="number" min="0" step="0.01" [(ngModel)]="priceRands" required />

        <label for="flyer">Flyer (image or PDF, downloadable on the event page)</label>
        @if (flyerUrl && !flyerFile) {
          <p class="meta">
            <a [href]="flyerUrl" target="_blank">Current flyer ↗</a>
            <button type="button" class="secondary" (click)="removeFlyer()">Remove</button>
          </p>
        }
        <input
          id="flyer"
          name="flyer"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          (change)="onFlyerChange($event)"
        />

        <label for="capacity">Capacity (blank = unlimited)</label>
        <input id="capacity" name="capacity" type="number" min="1" [(ngModel)]="capacity" />

        <label for="status">Status</label>
        <select id="status" name="status" [(ngModel)]="status">
          <option value="draft">Draft (not buyable yet)</option>
          <option value="published">Published (on sale)</option>
          <option value="closed">Closed (sales stopped)</option>
        </select>

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }

        <button class="primary" type="submit" [disabled]="busy()">
          {{ busy() ? 'Saving…' : eventId ? 'Save changes' : 'Create event' }}
        </button>
      </form>
      }
    </div>
  `,
})
export class EventFormPage {
  private readonly api = inject(ApiService);
  private readonly supabase = inject(SupabaseService);
  private readonly meService = inject(MeService);
  private readonly router = inject(Router);

  protected readonly eventId: string | null =
    inject(ActivatedRoute).snapshot.paramMap.get('id');

  protected readonly currencies = SUPPORTED_CURRENCIES;

  protected name = '';
  protected slug = '';
  protected description = '';
  protected venue = '';
  protected startsAt = '';
  protected priceRands: number | null = null;
  protected currency: Currency = 'ZAR';
  protected capacity: number | null = null;
  protected status: 'draft' | 'published' | 'closed' = 'draft';
  protected flyerUrl: string | null = null;
  protected flyerFile: File | null = null;

  // Super admins can create events on behalf of any organization; org admins
  // never see this — the API pins their events to their own org.
  protected readonly orgs = signal<OrganizationRecord[]>([]);
  protected organizationId: string | null = null;

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Editing: the form is hidden behind a skeleton until the event arrives.
   *  The signal flip also schedules change detection, so the inputs render
   *  already populated (zoneless CD won't re-render on a bare promise). */
  protected readonly loading = signal(false);
  protected readonly skeletonFields = Array.from({ length: 7 });
  private slugTouched = false;

  constructor() {
    if (!this.eventId) {
      this.meService.load().then((me) => {
        if (me?.role !== 'super_admin') return;
        this.api.listOrgs().then((orgs) => {
          this.orgs.set(orgs);
          this.organizationId ??= me.org?.id ?? orgs[0]?.id ?? null;
        });
      });
    }
    if (this.eventId) {
      this.slugTouched = true;
      this.loading.set(true);
      this.api
        .getEvent(this.eventId)
        .then((event) => {
          this.name = event.name;
          this.slug = event.slug;
          this.description = event.description ?? '';
          this.venue = event.venue ?? '';
          this.startsAt = toDatetimeLocal(event.starts_at);
          this.priceRands = event.price_cents / 100;
          this.currency = event.currency as Currency;
          this.capacity = event.capacity;
          this.status = event.status;
          this.flyerUrl = event.flyer_url;
        })
        .catch((err: Error) => this.error.set(err.message))
        .finally(() => this.loading.set(false));
    }
  }

  protected suggestSlug(): void {
    if (this.slugTouched && this.eventId) return;
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  protected onFlyerChange(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0] ?? null;
    if (file && !FLYER_CONTENT_TYPES.includes(file.type as FlyerContentType)) {
      this.error.set('Flyer must be a JPEG, PNG, WebP or PDF file');
      inputEl.value = '';
      this.flyerFile = null;
      return;
    }
    this.error.set(null);
    this.flyerFile = file;
  }

  protected removeFlyer(): void {
    this.flyerUrl = null;
  }

  protected async submit(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.form.markAllAsTouched();
      this.error.set('Please fill in the required fields highlighted above.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);

    const input: EventInput = {
      name: this.name,
      slug: this.slug,
      description: this.description || null,
      venue: this.venue || null,
      starts_at: new Date(this.startsAt).toISOString(),
      price_cents: Math.round((this.priceRands ?? 0) * 100),
      currency: this.currency,
      capacity: this.capacity || null,
      status: this.status,
      flyer_url: this.flyerUrl,
    };

    try {
      const saved = this.eventId
        ? await this.api.updateEvent(this.eventId, input)
        : await this.api.createEvent(
            this.organizationId
              ? { ...input, organization_id: this.organizationId }
              : input,
          );

      if (this.flyerFile) {
        await this.uploadFlyer(saved.id, this.flyerFile);
      }

      this.router.navigate(['/events', saved.id]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to save event');
      this.busy.set(false);
    }
  }

  /** Upload the flyer straight to storage, then attach its URL to the event. */
  private async uploadFlyer(eventId: string, file: File): Promise<void> {
    const { path, token, public_url } = await this.api.createFlyerUploadUrl(
      eventId,
      file.type as FlyerContentType,
    );
    const uploadError = await this.supabase.uploadFlyer(path, token, file);
    if (uploadError) {
      throw new Error(`Event saved, but the flyer upload failed: ${uploadError}`);
    }
    await this.api.updateEvent(eventId, { flyer_url: public_url });
  }
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
