import { Injectable, signal } from '@angular/core';
import { BetaMe } from '../beta';

/** The signed-in person, shared by the shell and the pages; the song pages' poll keeps it fresh. */
@Injectable({ providedIn: 'root' })
export class BetaSession {
  readonly me = signal<BetaMe | null>(null);

  /** One read of `/beta/me` for pages that do not poll it themselves; a failure leaves `me` as it was. */
  async load() {
    try {
      const r = await fetch('/beta/me', { cache: 'no-store' });
      if (r.ok) this.me.set(await r.json());
    } catch {
      // the pages show their own sign-in or network message
    }
  }
}
