import { Component, input, signal } from '@angular/core';
import { BetaMe } from '../beta';
import { BalanceComponent } from './balance.component';
import { ShellSpec } from './shell';

/**
 * The frame around every beta page: an 88 px sidebar on desktop (歌曲 / 管理 for admins, avatar at the bottom);
 * on phones a 56 px top bar (back or logo, title, balance pill) and bottom tabs (歌曲 / 我).
 */
@Component({
  selector: 'app-beta-shell',
  imports: [BalanceComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class BetaShellComponent {
  readonly me = input<BetaMe | null>(null);
  readonly spec = input.required<ShellSpec>();
  /** The phone 我 sheet (name, the balance pill, 管理 for admins). */
  protected readonly sheet = signal(false);
}
