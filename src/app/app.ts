import { Component } from '@angular/core';
import { JobsPage } from './pages/admin/jobs.page';
import { GeneratorPage } from './pages/generator/generator.page';
import { TimingPage } from './pages/timing/timing.page';
import { StudioPage } from './pages/studio/studio.page';
import { BetaPage } from './pages/beta/beta.page';
import { BetaAdminPage } from './pages/beta/beta-admin.page';

// ponytail: a path check instead of the router; switch to @angular/router when pages need parameters or guards
@Component({
  selector: 'app-root',
  imports: [GeneratorPage, JobsPage, TimingPage, StudioPage, BetaPage, BetaAdminPage],
  template: `@switch (page) {
    @case ('admin') {
      <app-jobs-page />
    }
    @case ('timing') {
      <app-timing-page />
    }
    @case ('studio') {
      <app-studio-page />
    }
    @case ('beta-admin') {
      <app-beta-admin-page />
    }
    @case ('beta') {
      <app-beta-page />
    }
    @default {
      <app-generator-page />
    }
  }`,
})
export class App {
  protected readonly page = location.pathname.startsWith('/my/admin') ? 'beta-admin' : location.pathname.startsWith('/my') ? 'beta' : location.pathname.startsWith('/admin') ? 'admin' : location.pathname.startsWith('/timing') ? 'timing' : location.pathname.startsWith('/studio') ? 'studio' : 'home';
}
