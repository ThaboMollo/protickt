import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { EventInput } from '@protickt/shared';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-event-form',
  imports: [FormsModule],
  template: `
    <h1>{{ eventId ? 'Edit event' : 'New event' }}</h1>

    <div class="card">
      <form (ngSubmit)="submit()">
        <label for="name">Event name</label>
        <input id="name" name="name" [(ngModel)]="name" required (input)="suggestSlug()" />

        <label for="slug">Link slug (protickt.app/e/…)</label>
        <input id="slug" name="slug" [(ngModel)]="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" />

        <label for="description">Description</label>
        <textarea id="description" name="description" rows="4" [(ngModel)]="description"></textarea>

        <label for="venue">Venue</label>
        <input id="venue" name="venue" [(ngModel)]="venue" />

        <label for="starts_at">Starts at</label>
        <input id="starts_at" name="starts_at" type="datetime-local" [(ngModel)]="startsAt" required />

        <label for="price">Ticket price (R, 0 = free)</label>
        <input id="price" name="price" type="number" min="0" step="0.01" [(ngModel)]="priceRands" required />

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
    </div>
  `,
})
export class EventFormPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly eventId: string | null =
    inject(ActivatedRoute).snapshot.paramMap.get('id');

  protected name = '';
  protected slug = '';
  protected description = '';
  protected venue = '';
  protected startsAt = '';
  protected priceRands: number | null = null;
  protected capacity: number | null = null;
  protected status: 'draft' | 'published' | 'closed' = 'draft';

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private slugTouched = false;

  constructor() {
    if (this.eventId) {
      this.slugTouched = true;
      this.api.getEvent(this.eventId).then((event) => {
        this.name = event.name;
        this.slug = event.slug;
        this.description = event.description ?? '';
        this.venue = event.venue ?? '';
        this.startsAt = toDatetimeLocal(event.starts_at);
        this.priceRands = event.price_cents / 100;
        this.capacity = event.capacity;
        this.status = event.status;
      });
    }
  }

  protected suggestSlug(): void {
    if (this.slugTouched && this.eventId) return;
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);

    const input: EventInput = {
      name: this.name,
      slug: this.slug,
      description: this.description || null,
      venue: this.venue || null,
      starts_at: new Date(this.startsAt).toISOString(),
      price_cents: Math.round((this.priceRands ?? 0) * 100),
      currency: 'ZAR',
      capacity: this.capacity || null,
      status: this.status,
    };

    try {
      const saved = this.eventId
        ? await this.api.updateEvent(this.eventId, input)
        : await this.api.createEvent(input);
      this.router.navigate(['/events', saved.id]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to save event');
      this.busy.set(false);
    }
  }
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
