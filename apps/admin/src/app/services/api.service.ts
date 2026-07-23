import { Injectable, inject } from '@angular/core';
import type {
  AdminMeResponse,
  AdminRole,
  CheckinResponse,
  EventInput,
  EventRecord,
  EventStats,
  EventUpdate,
  FlyerContentType,
  FlyerUploadUrlResponse,
  LogoContentType,
  OrderRecord,
  OrganizationRecord,
  OrgInput,
  OrgPaystackKeys,
  OrgUpdate,
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

  getMe(): Promise<AdminMeResponse> {
    return this.request('GET', '/admin/me');
  }

  listEvents(): Promise<EventRecord[]> {
    return this.request('GET', '/admin/events');
  }

  getEvent(id: string): Promise<EventRecord> {
    return this.request('GET', `/admin/events/${id}`);
  }

  /** organization_id is honoured by the API for super admins only. */
  createEvent(input: EventInput & { organization_id?: string }): Promise<EventRecord> {
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

  // -- Organization management (super admin only) ---------------------------

  listOrgs(): Promise<OrganizationRecord[]> {
    return this.request('GET', '/admin/orgs');
  }

  createOrg(input: OrgInput): Promise<OrganizationRecord> {
    return this.request('POST', '/admin/orgs', input);
  }

  updateOrg(id: string, input: OrgUpdate): Promise<OrganizationRecord> {
    return this.request('PATCH', `/admin/orgs/${id}`, input);
  }

  /** Write-only: the API never returns key material back. */
  setOrgPaystackKeys(id: string, keys: OrgPaystackKeys): Promise<OrganizationRecord> {
    return this.request('PUT', `/admin/orgs/${id}/paystack-keys`, keys);
  }

  createLogoUploadUrl(
    orgId: string,
    contentType: LogoContentType,
  ): Promise<FlyerUploadUrlResponse> {
    return this.request('POST', `/admin/orgs/${orgId}/logo-upload-url`, {
      content_type: contentType,
    });
  }

  listOrgAdmins(
    orgId: string,
  ): Promise<{ user_id: string; role: AdminRole; email: string | null; created_at: string }[]> {
    return this.request('GET', `/admin/orgs/${orgId}/admins`);
  }

  addOrgAdmin(orgId: string, email: string, role: AdminRole): Promise<unknown> {
    return this.request('POST', `/admin/orgs/${orgId}/admins`, { email, role });
  }
}
