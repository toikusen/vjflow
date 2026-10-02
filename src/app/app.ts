import { Component } from '@angular/core';
import { JobsPage } from './pages/admin/jobs.page';
import { GeneratorPage } from './pages/generator/generator.page';

// ponytail: two pages, a path check instead of the router; switch to @angular/router when a third page arrives
@Component({
  selector: 'app-root',
  imports: [GeneratorPage, JobsPage],
  template: `@if (admin) {
    <app-jobs-page />
  } @else {
    <app-generator-page />
  }`,
})
export class App {
  protected readonly admin = location.pathname.startsWith('/admin');
}
