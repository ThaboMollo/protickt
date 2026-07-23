import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { EventRecord, EventStats, EventStatus, OrderRecord } from '@protickt/shared';
import { formatMoney } from '@protickt/shared';
import { ApiService } from '../../services/api.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-event-detail',
  imports: [RouterLink, DatePipe],
  template: `
    @if (event(); as ev) {
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h1>{{ ev.name }}</h1>
        <a [routerLink]="['/events', ev.id, 'edit']"><button class="secondary">Edit</button></a>
      </div>

      <div class="card">
        <p class="meta">📅 {{ ev.starts_at | date: 'full' }}</p>
        @if (ev.venue) {
          <p class="meta">📍 {{ ev.venue }}</p>
        }
        <p class="meta">
          🎟️ {{ price(ev) }} · capacity {{ ev.capacity ?? 'unlimited' }} ·
          <span class="badge {{ ev.status }}">{{ ev.status }}</span>
        </p>
        @if (ev.flyer_url) {
          <p class="meta">🖼️ <a [href]="ev.flyer_url" target="_blank">View flyer</a></p>
        }

        <p>
          @if (ev.status === 'draft') {
            <button class="primary" [disabled]="statusBusy()" (click)="setStatus('published')">
              Publish
            </button>
          } @else if (ev.status === 'published') {
            <button class="secondary" [disabled]="statusBusy()" (click)="setStatus('draft')">
              Unpublish (back to draft)
            </button>
            <button class="secondary" [disabled]="statusBusy()" (click)="setStatus('closed')">
              Close sales
            </button>
          } @else {
            <button class="primary" [disabled]="statusBusy()" (click)="setStatus('published')">
              Reopen sales
            </button>
          }
        </p>

        @if (ev.status === 'published') {
          <label>Share this link with buyers</label>
          <input readonly [value]="shareLink(ev)" (click)="copyLink(ev)" />
          @if (copied()) {
            <p class="meta">Copied to clipboard ✓</p>
          }
        } @else {
          <p class="meta">Publish the event to get a shareable ticket link.</p>
        }
      </div>

      @if (stats(); as s) {
        <div class="card">
          <h2 style="margin-top: 0">Sales</h2>
          <table>
            <tbody>
              <tr>
                <td>Tickets sold</td>
                <td>
                  <strong>{{ s.tickets_sold }}</strong>
                  @if (ev.capacity) {
                    <span class="meta"> / {{ ev.capacity }}</span>
                  }
                </td>
              </tr>
              <tr>
                <td>Checked in at the gate</td>
                <td><strong>{{ s.checked_in }}</strong></td>
              </tr>
              <tr>
                <td>Paid orders</td>
                <td><strong>{{ s.orders_paid }}</strong></td>
              </tr>
              <tr>
                <td>Revenue</td>
                <td><strong>{{ revenue(s, ev) }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      }

      <div class="card">
        <h2 style="margin-top: 0">Orders</h2>
        @if (ordersLoading()) {
          @for (i of [1, 2]; track i) {
            <div class="skeleton skeleton-line"></div>
          }
        } @else if (orders().length === 0) {
          <p class="meta">No orders yet.</p>
        } @else {
          <table>
            <thead>
              <tr>
                <th>Buyer</th>
                <th>Contact</th>
                <th>Qty</th>
                <th>Amount</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              @for (order of orders(); track order.id) {
                <tr>
                  <td>{{ order.buyer_name }}</td>
                  <td>
                    {{ order.buyer_email }}
                    @if (order.buyer_phone) {
                      <br /><span class="meta">{{ order.buyer_phone }}</span>
                    }
                  </td>
                  <td>{{ order.quantity }}</td>
                  <td>{{ amount(order, ev) }}</td>
                  <td><span class="badge {{ order.status }}">{{ order.status }}</span></td>
                  <td>{{ order.created_at | date: 'short' }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    } @else if (error()) {
      <p class="error">{{ error() }}</p>
    } @else {
      <div class="skeleton skeleton-title"></div>
      <div class="card">
        @for (i of [1, 2, 3]; track i) {
          <div class="skeleton skeleton-line"></div>
        }
      </div>
      <div class="card">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="skeleton skeleton-line"></div>
        }
      </div>
    }
  `,
})
export class EventDetailPage {
  private readonly api = inject(ApiService);

  protected readonly event = signal<EventRecord | null>(null);
  protected readonly stats = signal<EventStats | null>(null);
  protected readonly orders = signal<OrderRecord[]>([]);
  protected readonly ordersLoading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly statusBusy = signal(false);

  constructor() {
    const id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
    this.api
      .getEvent(id)
      .then((event) => this.event.set(event))
      .catch((err: Error) => this.error.set(err.message));
    this.api.getStats(id).then((stats) => this.stats.set(stats)).catch(() => {});
    this.api
      .getOrders(id)
      .then((orders) => this.orders.set(orders))
      .catch(() => {})
      .finally(() => this.ordersLoading.set(false));
  }

  protected async setStatus(status: EventStatus): Promise<void> {
    const current = this.event();
    if (!current) return;
    this.statusBusy.set(true);
    try {
      this.event.set(await this.api.updateEvent(current.id, { status }));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      this.statusBusy.set(false);
    }
  }

  protected shareLink(event: EventRecord): string {
    return `${environment.webUrl}/e/${event.slug}`;
  }

  protected async copyLink(event: EventRecord): Promise<void> {
    await navigator.clipboard.writeText(this.shareLink(event));
    this.copied.set(true);
  }

  protected price(event: EventRecord): string {
    return event.price_cents === 0
      ? 'Free'
      : formatMoney(event.price_cents, event.currency);
  }

  protected revenue(stats: EventStats, event: EventRecord): string {
    return formatMoney(stats.revenue_cents, event.currency);
  }

  protected amount(order: OrderRecord, event: EventRecord): string {
    return formatMoney(order.amount_cents, event.currency);
  }
}
