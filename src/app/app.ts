import { Component } from '@angular/core';
import { GeneratorPage } from './pages/generator/generator.page';

@Component({
  selector: 'app-root',
  imports: [GeneratorPage],
  template: '<app-generator-page />',
})
export class App {}
