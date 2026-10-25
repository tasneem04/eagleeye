// Timeline over a scenario's keyframes. Positions between keyframes are
// interpolated linearly; analysis always happens on an exact keyframe.

const EPS = 1e-6;

export class Playback {
  constructor() {
    this.frames = [];
    this.t = 0;
    this.playing = false;
    this.speed = 1;
  }

  load(frames) {
    this.frames = frames;
    this.t = frames[0].time;
    this.playing = false;
  }

  get start() {
    return this.frames[0].time;
  }

  get end() {
    return this.frames[this.frames.length - 1].time;
  }

  play() {
    if (this.t >= this.end - EPS) this.t = this.start;
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  seek(t) {
    this.t = Math.min(this.end, Math.max(this.start, t));
  }

  seekToFrame(index) {
    this.seek(this.frames[index].time);
  }

  tick(dt) {
    if (!this.playing) return;
    this.t += dt * this.speed;
    if (this.t >= this.end) {
      this.t = this.end;
      this.playing = false;
    }
  }

  /** Jump to the next (dir > 0) or previous (dir < 0) keyframe. */
  step(dir) {
    this.pause();
    const times = this.frames.map((f) => f.time);
    const target = dir > 0
      ? times.find((time) => time > this.t + EPS)
      : [...times].reverse().find((time) => time < this.t - EPS);
    if (target !== undefined) this.t = target;
  }

  nearestKeyframe() {
    let best = 0;
    this.frames.forEach((f, i) => {
      if (Math.abs(f.time - this.t) < Math.abs(this.frames[best].time - this.t)) best = i;
    });
    return best;
  }

  /** Interpolated players and ball at the current time. */
  current() {
    const { frames } = this;
    let i = 0;
    while (i < frames.length - 2 && frames[i + 1].time <= this.t) i++;
    const a = frames[i];
    const b = frames[Math.min(i + 1, frames.length - 1)];
    const span = b.time - a.time;
    const k = span > 0 ? Math.min(1, Math.max(0, (this.t - a.time) / span)) : 0;
    if (k >= 1 - EPS) return { players: b.players, ball: b.ball };

    const next = new Map(b.players.map((p) => [p.id, p]));
    const players = a.players.map((p) => {
      const q = next.get(p.id) ?? p;
      return { ...p, x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k) };
    });
    const ball = {
      x: lerp(a.ball.x, b.ball.x, k),
      y: lerp(a.ball.y, b.ball.y, k),
      owner: k < EPS ? a.ball.owner : a.ball.owner === b.ball.owner ? a.ball.owner : null,
    };
    return { players, ball };
  }
}

function lerp(a, b, k) {
  return a + (b - a) * k;
}
