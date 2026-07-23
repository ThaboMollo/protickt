import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrganizationRecord } from '@protickt/shared';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-orgs-list',
  imports: [RouterLink],
  template: `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <h1>Organizations</h1>
      <a routerLink="/orgs/new"><button class="primary" style="margin: 0">+ New organization</button></a>
    </div>

    @if (error()) {
      <p class="error">{{ error() }}</p>
    }

    <div class="card">
      @if (loading()) {
        <p class="meta">Loading…</p>
      } @else {
        <table>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Slug</th>
              <th>Buyer site</th>
              <th>Paystack</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            @for (org of orgs(); track org.id) {
              <tr>
                <td>
                  <a [routerLink]="['/orgs', org.id, 'edit']">{{ org.name }}</a>
                </td>
                <td>{{ org.slug }}</td>
                <td>
                  <a [href]="org.site_url" target="_blank">{{ org.site_url }}</a>
                </td>
                <td>
                  <span class="badge {{ org.has_paystack_keys ? 'published' : 'draft' }}">
                    {{ org.has_paystack_keys ? 'keys set' : 'no keys' }}
                  </span>
                </td>
                <td>
                  <span class="badge {{ org.status === 'active' ? 'published' : 'closed' }}">
                    {{ org.status }}
                  </span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
})
export class OrgsListPage {
  private readonly api = inject(ApiService);

  protected readonly orgs = signal<OrganizationRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.api
      .listOrgs()
      .then((orgs) => this.orgs.set(orgs))
      .catch((err: Error) => this.error.set(err.message))
      .finally(() => this.loading.set(false));
  }
}
