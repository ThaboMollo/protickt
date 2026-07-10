import { Injectable, inject } from '@angular/core';
import type {
  CheckinResponse,
  EventInput,
  EventRecord,
  EventStats,
  EventUpdate,
  FlyerContentType,
  FlyerUploadUrlResponse,
  OrderRecord,
} from '@protickt/shared';
import { environment } from '../../environments/environment';
import { SupabaseService } from './supabase.service';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly supabase = inject(SupabaseService);

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.supabase.accessToken();
    const res = await fetch(`${environment.apiUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
    }
    return data as T;
  }

  listEvents(): Promise<EventRecord[]> {
    return this.request('GET', '/admin/events');
  }

  getEvent(id: string): Promise<EventRecord> {
    return this.request('GET', `/admin/events/${id}`);
  }

  createEvent(input: EventInput): Promise<EventRecord> {
    return this.request('POST', '/admin/events', input);
  }

  updateEvent(id: string, input: EventUpdate): Promise<EventRecord> {
    return this.request('PATCH', `/admin/events/${id}`, input);
  }

  createFlyerUploadUrl(
    eventId: string,
    contentType: FlyerContentType,
  ): Promise<FlyerUploadUrlResponse> {
    return this.request('POST', `/admin/events/${eventId}/flyer-upload-url`, {
      content_type: contentType,
    });
  }

  getStats(id: string): Promise<EventStats> {
    return this.request('GET', `/admin/events/${id}/stats`);
  }

  getOrders(id: string): Promise<OrderRecord[]> {
    return this.request('GET', `/admin/events/${id}/orders`);
  }

  checkin(rawCode: string, eventId: string | null): Promise<CheckinResponse> {
    return this.request('POST', '/admin/checkin', {
      code: rawCode,
      event_id: eventId,
    });
  }
}
