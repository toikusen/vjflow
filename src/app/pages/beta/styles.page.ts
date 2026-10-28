import { Component } from '@angular/core';

/** `/my/styles`: the style overview is not built yet (4b), so the tab says so. */
@Component({
  selector: 'app-beta-styles-page',
  template: `
    <div class="page">
      <h1>風格</h1>
      <div class="empty"><p>即將推出</p></div>
    </div>
  `,
  styles: `
    .page {
      display: flex;
      flex-direction: column;
      gap: 24px;
      padding: 28px 40px;
    }
    h1 {
      margin: 0;
      font: 700 26px var(--font-display);
      letter-spacing: -0.02em;
    }
    .empty {
      display: grid;
      place-items: center;
      min-height: 220px;
      color: var(--muted);
      border: 1px dashed var(--border-strong);
      border-radius: 16px;
      p {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
      }
    }
    @media (max-width: 720px) {
      .page {
        padding: 14px 16px;
      }
      h1 {
        display: none;
      }
    }
  `,
})
export class BetaStylesPage {}
