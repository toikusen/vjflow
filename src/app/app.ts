import { Component } from '@angular/core';
import { JobsPage } from './pages/admin/jobs.page';
import { GeneratorPage } from './pages/generator/generator.page';
import { TimingPage } from './pages/timing/timing.page';
import { StudioPage } from './pages/studio/studio.page';
import { BetaPage } from './pages/beta/beta.page';
import { BetaAdminPage } from './pages/beta/beta-admin.page';
import { BetaAdminSongPage } from './pages/beta/admin-song.page';
import { BetaSongPage } from './pages/beta/song.page';
import { pageFor } from './pages/beta/route';

// ponytail: a path check instead of the router; switch to @angular/router when pages need parameters or guards
@Component({
  selector: 'app-root',
  imports: [GeneratorPage, JobsPage, TimingPage, StudioPage, BetaPage, BetaAdminPage, BetaAdminSongPage, BetaSongPage],
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
    @case ('beta-admin-song') {
      <app-beta-admin-song-page />
    }
    @case ('beta-song') {
      <app-beta-song-page />
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
  protected readonly page = pageFor(location.pathname);
}
