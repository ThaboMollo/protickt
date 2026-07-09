import {
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import jsQR from 'jsqr';
import type { CheckinResponse, EventRecord } from '@protickt/shared';
import { ApiService } from '../../services/api.service';

/** Minimal typing for the native BarcodeDetector (not yet in TS's dom lib everywhere). */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare const BarcodeDetector:
  | (new (options?: { formats: string[] }) => BarcodeDetectorLike)
  | undefined;

const RESULT_LABELS: Record<string, { title: string; hint: string; kind: 'ok' | 'bad' }> = {
  ok: { title: '✅ Valid — let them in', hint: '', kind: 'ok' },
  already_used: {
    title: '⛔ Already used',
    hint: 'This ticket was checked in earlier — see the time below.',
    kind: 'bad',
  },
  void: { title: '⛔ Voided ticket', hint: 'This ticket was cancelled or refunded.', kind: 'bad' },
  not_found: { title: '⛔ Not a valid ticket', hint: 'The code does not exist.', kind: 'bad' },
  wrong_event: {
    title: '⛔ Wrong event',
    hint: 'This ticket belongs to a different event.',
    kind: 'bad',
  },
};

@Component({
  selector: 'app-scanner',
  imports: [FormsModule],
  template: `
    <h1>Gate scanner</h1>

    <div class="card">
      <label for="event">Scanning for event</label>
      <select id="event" name="event" [(ngModel)]="eventId">
        <option [ngValue]="null">Any event (not recommended)</option>
        @for (event of events(); track event.id) {
          <option [ngValue]="event.id">{{ event.name }}</option>
        }
      </select>

      @if (!scanning()) {
        <button class="primary" (click)="start()">Start camera</button>
      } @else {
        <button class="primary" style="background: var(--bad)" (click)="stop()">
          Stop camera
        </button>
      }
      @if (cameraError()) {
        <p class="error">{{ cameraError() }}</p>
      }
    </div>

    <div class="card" [hidden]="!scanning()">
      <video #video playsinline style="width: 100%; border-radius: 8px"></video>
      <p class="meta" style="text-align: center">Point the camera at the ticket QR code.</p>
    </div>

    @if (result(); as r) {
      <div
        class="card"
        style="text-align: center"
        [style.borderColor]="r.kind === 'ok' ? 'var(--ok)' : 'var(--bad)'"
        [style.borderWidth.px]="3"
      >
        <h2 [class]="r.kind === 'ok' ? 'status-ok' : 'status-bad'" style="font-size: 1.6rem">
          {{ r.title }}
        </h2>
        @if (r.hint) {
          <p class="meta">{{ r.hint }}</p>
        }
        @if (r.ticket) {
          <p>
            <strong>{{ r.ticket.buyer_name }}</strong> · {{ r.ticket.event_name }}
          </p>
          @if (r.ticket.checked_in_at) {
            <p class="meta">Checked in: {{ formatTime(r.ticket.checked_in_at) }}</p>
          }
        }
        <button class="primary" (click)="resume()">Scan next</button>
      </div>
    }
  `,
  styles: `
    .status-ok { color: var(--ok); }
    .status-bad { color: var(--bad); }
  `,
})
export class ScannerPage implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly events = signal<EventRecord[]>([]);
  protected eventId: string | null = null;

  protected readonly scanning = signal(false);
  protected readonly cameraError = signal<string | null>(null);
  protected readonly result = signal<
    | (CheckinResponse & { title: string; hint: string; kind: 'ok' | 'bad' })
    | null
  >(null);

  private stream: MediaStream | null = null;
  private frameTimer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private lastCode: string | null = null;
  private canvas = document.createElement('canvas');

  constructor() {
    this.api.listEvents().then((events) => {
      this.events.set(events.filter((e) => e.status !== 'draft'));
    });
  }

  protected async start(): Promise<void> {
    this.cameraError.set(null);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch {
      this.cameraError.set(
        'Could not access the camera. Allow camera permission and try again (HTTPS or localhost required).',
      );
      return;
    }
    const video = this.video().nativeElement;
    video.srcObject = this.stream;
    await video.play();
    this.scanning.set(true);
    this.paused = false;
    this.scanLoop();
  }

  protected stop(): void {
    this.frameTimer && clearTimeout(this.frameTimer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.scanning.set(false);
  }

  protected resume(): void {
    this.result.set(null);
    this.lastCode = null;
    this.paused = false;
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private scanLoop(): void {
    if (!this.stream) return;
    this.frameTimer = setTimeout(async () => {
      if (!this.paused) {
        const raw = await this.readFrame();
        if (raw && raw !== this.lastCode) {
          this.lastCode = raw;
          this.paused = true;
          await this.checkin(raw);
        }
      }
      this.scanLoop();
    }, 250);
  }

  private async readFrame(): Promise<string | null> {
    const video = this.video().nativeElement;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;

    if (typeof BarcodeDetector !== 'undefined') {
      try {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const codes = await detector.detect(video);
        return codes[0]?.rawValue ?? null;
      } catch {
        // fall through to jsQR
      }
    }

    this.canvas.width = video.videoWidth;
    this.canvas.height = video.videoHeight;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || this.canvas.width === 0) return null;
    ctx.drawImage(video, 0, 0);
    const image = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    return jsQR(image.data, image.width, image.height)?.data ?? null;
  }

  private async checkin(raw: string): Promise<void> {
    try {
      const response = await this.api.checkin(raw, this.eventId);
      const label = RESULT_LABELS[response.result] ?? RESULT_LABELS['not_found'];
      this.result.set({ ...response, ...label });
      navigator.vibrate?.(label.kind === 'ok' ? 100 : [80, 60, 80]);
    } catch (err) {
      this.result.set({
        result: 'not_found',
        title: '⚠️ Scan failed',
        hint: err instanceof Error ? err.message : 'Network error — try again.',
        kind: 'bad',
      });
    }
  }

  protected formatTime(iso: string): string {
    return new Date(iso).toLocaleString('en-ZA');
  }
}
