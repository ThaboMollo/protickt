import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { EventRecord } from '@protickt/shared';
import { formatMoney } from '@protickt/shared';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-events-list',
  imports: [RouterLink, DatePipe],
  template: `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <h1>Events</h1>
      <a routerLink="/events/new"><button class="primary" style="margin: 0">+ New event</button></a>
    </div>

    @if (error()) {
      <p class="error">{{ error() }}</p>
    }

    <div class="card">
      @if (loading()) {
        <p class="meta">Loading…</p>
      } @else if (events().length === 0) {
        <p class="meta">No events yet — create your first one.</p>
      } @else {
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Starts</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            @for (event of events(); track event.id) {
              <tr>
                <td>
                  <a [routerLink]="['/events', event.id]">{{ event.name }}</a>
                </td>
                <td>{{ event.starts_at | date: 'medium' }}</td>
                <td>{{ price(event) }}</td>
                <td>
                  <span class="badge {{ event.status }}">{{ event.status }}</span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
})
export class EventsListPage {
  private readonly api = inject(ApiService);

  protected readonly events = signal<EventRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.api
      .listEvents()
      .then((events) => this.events.set(events))
      .catch((err: Error) => this.error.set(err.message))
      .finally(() => this.loading.set(false));
  }

  protected price(event: EventRecord): string {
    return event.price_cents === 0
      ? 'Free'
      : formatMoney(event.price_cents, event.currency);
  }
}
