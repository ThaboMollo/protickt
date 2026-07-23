import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { superAdminGuard } from './super-admin.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'events', pathMatch: 'full' },
      {
        path: 'events',
        loadComponent: () =>
          import('./pages/events/events-list').then((m) => m.EventsListPage),
      },
      {
        path: 'events/new',
        loadComponent: () =>
          import('./pages/events/event-form').then((m) => m.EventFormPage),
      },
      {
        path: 'events/:id',
        loadComponent: () =>
          import('./pages/events/event-detail').then((m) => m.EventDetailPage),
      },
      {
        path: 'events/:id/edit',
        loadComponent: () =>
          import('./pages/events/event-form').then((m) => m.EventFormPage),
      },
      {
        path: 'scan',
        loadComponent: () =>
          import('./pages/scanner/scanner').then((m) => m.ScannerPage),
      },
      {
        path: 'orgs',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./pages/orgs/orgs-list').then((m) => m.OrgsListPage),
      },
      {
        path: 'orgs/new',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./pages/orgs/org-form').then((m) => m.OrgFormPage),
      },
      {
        path: 'orgs/:id/edit',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./pages/orgs/org-form').then((m) => m.OrgFormPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
