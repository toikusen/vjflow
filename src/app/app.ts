import { Component, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { JobsPage } from './pages/admin/jobs.page';
import { GeneratorPage } from './pages/generator/generator.page';
import { TimingPage } from './pages/timing/timing.page';
import { StudioPage } from './pages/studio/studio.page';
import { BetaPage } from './pages/beta/beta.page';
import { BetaAdminPage } from './pages/beta/beta-admin.page';
import { BetaAdminSongPage } from './pages/beta/admin-song.page';
import { BetaSongPage } from './pages/beta/song.page';
import { BetaStylesPage } from './pages/beta/styles.page';
import { pageFor } from './pages/beta/route';
import { BetaShellComponent } from './pages/beta/ui/shell.component';
import { shellFor } from './pages/beta/ui/shell';
import { BetaSession } from './pages/beta/ui/session';

// ponytail: a path check instead of the router; switch to @angular/router when pages need parameters or guards
@Component({
  selector: 'app-root',
  imports: [NgTemplateOutlet, GeneratorPage, JobsPage, TimingPage, StudioPage, BetaPage, BetaAdminPage, BetaAdminSongPage, BetaSongPage, BetaStylesPage, BetaShellComponent],
  template: `@if (shell; as s) {
      <app-beta-shell [spec]="s" [me]="session.me()"><ng-container *ngTemplateOutlet="pages" /></app-beta-shell>
    } @else {
      <ng-container *ngTemplateOutlet="pages" />
    }
    <ng-template #pages>
      @switch (page) {
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
        @case ('beta-styles') {
          <app-beta-styles-page />
        }
        @case ('beta') {
          <app-beta-page />
        }
        @default {
          <app-generator-page />
        }
      }
    </ng-template>`,
})
export class App {
  protected readonly page = pageFor(location.pathname);
  protected readonly shell = shellFor(this.page);
  protected readonly session = inject(BetaSession);

  constructor() {
    // the song pages poll /beta/me themselves; the admin and style pages only need it once for the shell
    if (this.shell && this.page !== 'beta' && this.page !== 'beta-song') this.session.load();
  }
}
