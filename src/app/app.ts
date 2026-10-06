import { Component } from '@angular/core';
import { JobsPage } from './pages/admin/jobs.page';
import { GeneratorPage } from './pages/generator/generator.page';
import { TimingPage } from './pages/timing/timing.page';
import { StudioPage } from './pages/studio/studio.page';

// ponytail: a path check instead of the router; switch to @angular/router when pages need parameters or guards
@Component({
  selector: 'app-root',
  imports: [GeneratorPage, JobsPage, TimingPage, StudioPage],
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
    @default {
      <app-generator-page />
    }
  }`,
})
export class App {
  protected readonly page = location.pathname.startsWith('/admin') ? 'admin' : location.pathname.startsWith('/timing') ? 'timing' : location.pathname.startsWith('/studio') ? 'studio' : 'home';
}
