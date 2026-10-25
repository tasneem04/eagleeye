// Gaze model for shoulder checks, built from published human data:
//
// Range (how far you can look while your body still faces the ball):
// - Active neck rotation is about 70° to each side in young adults (2023 goniometric study,
//   300 people aged 18-29: 71° right, 70° left).
// - The eyes rarely turn more than about 30° within the head; beyond about 50° of gaze shift,
//   the upper trunk starts to join in.
//   => a quick check reaches about 90°; holding the turn reaches about 120°
//      (neck 70° + eyes 30° + a small upper-body twist). Straight behind you needs a body turn.
//
// Speed (how fast the gaze gets there):
// - Large gaze shifts have a smooth, bell-shaped velocity profile; a 90° shift takes about 315 ms.
//   Anastasopoulos et al., Experimental Brain Research, 2015.
// - In 11v11 matches, scans away from the ball last about 0.4 s, and the stop point of a scan
//   is where the information comes from. Aksum et al., PLoS ONE, 2021.
// - Football head-turn studies count a turn above 125°/s. McGuckian et al., 2018-2020.
//
// The motion is a critically damped spring with acceleration and speed limits, so it starts,
// stops and reverses smoothly, with no jumps in speed. Time is drill time, so the slow-motion
// levels slow the head down with the rest of the world.

export const GLANCE_DEG = 90;     // tap: quick shoulder check
export const MAX_TURN_DEG = 120;  // hold: furthest gaze while the body faces the ball
export const MIN_DWELL_S = 0.08;  // a glance settles briefly at its stop point
export const MOVING_DEG_S = 125;  // faster than this, the picture is a blur

const OMEGA = 14;        // spring stiffness (rad/s): sets how quickly the gaze homes in
const MAX_ACCEL = 5200;  // deg/s²: no instant starts or stops
const MAX_SPEED = 480;   // deg/s: about the peak gaze (eye + head) speed in large shifts

export class Gaze {
  constructor() {
    this.reset();
  }

  reset() {
    this.angle = 0;      // gaze yaw relative to the ball, degrees, + = right
    this.velocity = 0;   // degrees per drill-second
    this.target = 0;
    this.held = 0;       // -1 left, +1 right, 0 none
    this.glanceSide = 0; // a tapped glance still on its way out
    this.dwell = 0;
  }

  /** Press: turn towards that side; keep holding to go as far as you can. */
  press(side) {
    this.held = side;
    this.glanceSide = side;
    this.dwell = 0;
    this.target = side * MAX_TURN_DEG;
  }

  /** Release: a short tap still completes a full quick check before coming back to the ball. */
  release(side) {
    if (this.held !== side) return;
    this.held = 0;
    if (Math.abs(this.angle) >= GLANCE_DEG - 2) {
      this.glanceSide = 0;
      this.target = 0;
    } else {
      this.target = side * GLANCE_DEG;
    }
  }

  update(dt) {
    if (dt <= 0) return;
    // A tapped glance: once it has settled at its stop point, head back to the ball.
    if (!this.held && this.glanceSide) {
      const settled = Math.abs(this.target - this.angle) < 3 && Math.abs(this.velocity) < 40;
      if (settled) {
        this.dwell += dt;
        if (this.dwell >= MIN_DWELL_S) {
          this.glanceSide = 0;
          this.target = 0;
        }
      }
    }
    // Integrate in small steps so the motion is the same at any frame rate.
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      let accel = OMEGA * OMEGA * (this.target - this.angle) - 2 * OMEGA * this.velocity;
      accel = Math.max(-MAX_ACCEL, Math.min(MAX_ACCEL, accel));
      this.velocity = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, this.velocity + accel * h));
      this.angle = Math.max(-MAX_TURN_DEG, Math.min(MAX_TURN_DEG, this.angle + this.velocity * h));
    }
  }

  /** Taking in information needs a (nearly) still gaze: the stop point, not the sweep. */
  get steady() {
    return Math.abs(this.velocity) <= MOVING_DEG_S;
  }
}
