// Pure play-timing logic: no DOM, runs in the browser and in Node tests.
//
// Coordinates: 10 units per foot, court centred on x=260, baseline at y=40.
//
// A play is a list of steps. Each step has starting positions, a ball holder
// and actions (cut / dribble / screen / handoff / pass). This module turns a
// step into a timeline in which the pass is sequenced against the movement
// instead of everything running on one shared clock.

export const MOVE_TYPES = ['cut', 'dribble', 'screen', 'handoff'];

const LEAD_IN = 0.3; // seconds the step's lines are shown before anything moves
const TAIL = 0.4; // hold on the end frame
const HANDOFF = 0.3;
const MOVE_SPEED = 140; // court units per second (14 ft/s)
const PASS_SPEED = 380;
const PASS_OVERLAP = 0.6; // "pass first": movement starts this far into the flight
const BALL_OFFSET = { x: 11, y: -13 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const pt = (p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y });

/** Smooth a drawn path: interior points act as quadratic control points. */
export function smoothPath(points, perSegment = 12) {
  const pts = points.map(pt);
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  let from = pts[0];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const ctrl = pts[i];
    const to = i === pts.length - 2 ? pts[i + 1] : lerp(pts[i], pts[i + 1], 0.5);
    for (let s = 1; s <= perSegment; s += 1) {
      const t = s / perSegment;
      out.push(lerp(lerp(from, ctrl, t), lerp(ctrl, to, t), t));
    }
    from = to;
  }
  return out;
}

export function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) len += dist(pts[i - 1], pts[i]);
  return len;
}

export function pointAlong(pts, fraction) {
  if (!pts.length) return null;
  if (pts.length === 1 || fraction <= 0) return pts[0];
  let remaining = Math.min(fraction, 1) * pathLength(pts);
  for (let i = 1; i < pts.length; i += 1) {
    const seg = dist(pts[i - 1], pts[i]);
    if (remaining <= seg) return lerp(pts[i - 1], pts[i], seg ? remaining / seg : 0);
    remaining -= seg;
  }
  return pts[pts.length - 1];
}

const flightTime = (a, b) => clamp(dist(a, b) / PASS_SPEED, 0.45, 0.9);

const stepPositions = (step) =>
  Object.fromEntries(Object.entries(step.pos || {}).map(([id, p]) => [id, pt(p)]));

/** Who has the ball once this step's pass / handoff has happened. */
export function endHolder(step) {
  let holder = effectiveHolder(step);
  for (const a of step.actions || []) {
    if (a.type === 'pass' && a.from === holder) holder = a.to;
    if (a.type === 'handoff' && a.player === holder && a.to) holder = a.to;
  }
  return holder;
}

// A drawn pass is authoritative: if it starts from someone other than the
// recorded holder, the passer is treated as the holder for this step.
function effectiveHolder(step) {
  const pass = (step.actions || []).find((a) => a.type === 'pass');
  if (pass && pass.from !== step.holder) return pass.from;
  return step.holder || null;
}

/**
 * Decide which moves run before the pass ("pre") and which after ("post").
 * mode: 'auto' | 'first' | 'last' | 'together'
 */
function splitMoves(moves, pass, mode) {
  if (!pass || mode === 'together') return { pre: moves, post: [] };
  if (mode === 'first') return { pre: [], post: moves };
  if (mode === 'last') return { pre: moves, post: [] };
  const receiverMoves = moves.some((m) => m.player === pass.to);
  const passerDribbles = moves.some((m) => m.player === pass.from && m.type === 'dribble');
  // Nobody has to get anywhere before the catch: the pass starts the action.
  if (!receiverMoves && !passerDribbles) return { pre: [], post: moves };
  // Otherwise the receiver gets open (or the passer dribbles into position)
  // first, the pass is thrown, and only then does the passer cut.
  const passerCut = (m) => m.player === pass.from && m.type !== 'dribble';
  return { pre: moves.filter((m) => !passerCut(m)), post: moves.filter(passerCut) };
}

/**
 * Build the timeline for one step.
 * Returns { duration, tracks, ball, holder, endHolder, pass, start }.
 */
export function buildStep(play, index) {
  const step = play.steps[index];
  const next = play.steps[index + 1];
  const start = stepPositions(step);
  const holder = effectiveHolder(step);
  const actions = step.actions || [];
  const pass = actions.find((a) => a.type === 'pass' && a.from === holder && start[a.to]) || null;
  const mode = step.passTiming || 'auto';

  const moves = [];
  const moved = new Set();
  for (const a of actions) {
    if (!MOVE_TYPES.includes(a.type) || !a.path || a.path.length < 2 || !start[a.player]) continue;
    if (moved.has(a.player)) continue;
    moved.add(a.player);
    moves.push({ player: a.player, type: a.type, to: a.to, path: smoothPath(a.path) });
  }
  // A player repositioned between steps without a drawn action still slides.
  if (next) {
    const nextPos = stepPositions(next);
    for (const id of Object.keys(start)) {
      if (moved.has(id) || !nextPos[id] || dist(start[id], nextPos[id]) < 1) continue;
      moves.push({ player: id, type: 'drift', path: [start[id], nextPos[id]] });
    }
  }
  for (const m of moves) m.duration = clamp(pathLength(m.path) / MOVE_SPEED, 0.9, 2.2);

  const phaseLength = (list) => list.reduce((max, m) => Math.max(max, m.duration), 0);
  const ball = []; // ordered, contiguous segments
  const tracks = {};
  let t = LEAD_IN;

  const prev = index > 0 ? endHolder(play.steps[index - 1]) : null;
  let current = holder;
  if (prev && holder && prev !== holder && start[prev]) {
    ball.push({ kind: 'held', by: prev, t0: 0, t1: t });
    // The holder changed between steps with no pass drawn: show the ball travel.
    const bridge = flightTime(start[prev], start[holder]);
    ball.push({ kind: 'fly', from: prev, to: holder, t0: t, t1: t + bridge });
    t += bridge;
  }
  let heldFrom = ball.length ? t : 0;
  const hold = (until) => {
    if (current && until > heldFrom) ball.push({ kind: 'held', by: current, t0: heldFrom, t1: until });
    heldFrom = until;
  };
  const fly = (to, t0, t1) => {
    hold(t0);
    ball.push({ kind: 'fly', from: current, to, t0, t1 });
    current = to;
    heldFrom = t1;
  };
  const schedule = (list, at) => {
    for (const m of list) tracks[m.player] = { ...m, t0: at, t1: at + m.duration };
    return at + phaseLength(list);
  };
  const handoffs = (list) => {
    for (const m of list) {
      if (m.type !== 'handoff' || !m.to || m.player !== current || !start[m.to]) continue;
      const at = tracks[m.player].t1;
      fly(m.to, at, at + HANDOFF);
      t = Math.max(t, at + HANDOFF);
    }
  };

  const { pre, post } = splitMoves(moves, pass, mode);
  let passWindow = null;
  if (pass && mode === 'together') {
    const end = schedule(pre, t);
    const span = Math.max(end - t, 1.2);
    passWindow = { t0: t + span * 0.3, t1: t + span * 0.75 };
    fly(pass.to, passWindow.t0, passWindow.t1);
    t = Math.max(end, t + span);
  } else {
    t = schedule(pre, t);
    handoffs(pre);
    if (pass) {
      const endOf = (id) => (tracks[id] ? tracks[id].path[tracks[id].path.length - 1] : start[id]);
      const flight = flightTime(endOf(pass.from), endOf(pass.to));
      passWindow = { t0: t, t1: t + flight };
      fly(pass.to, t, t + flight);
      const postStart = post.length ? t + flight * PASS_OVERLAP : t + flight;
      t = Math.max(t + flight, schedule(post, postStart));
      handoffs(post);
    }
  }
  const duration = t + TAIL;
  hold(duration);

  // "look" actions mark a read the ball handler makes; nothing moves.
  const looks = actions.filter((a) => a.type === 'look' && start[a.from] && start[a.to]);

  return { index, duration, start, tracks, ball, holder, endHolder: current, pass, passWindow, looks };
}

/** Player positions, ball position and holder at `time` seconds into a step. */
export function frameAt(tl, time) {
  const t = clamp(time, 0, tl.duration);
  const pos = {};
  for (const [id, p] of Object.entries(tl.start)) {
    const track = tl.tracks[id];
    if (!track || t <= track.t0) pos[id] = p;
    else if (t >= track.t1) pos[id] = track.path[track.path.length - 1];
    else pos[id] = pointAlong(track.path, ease((t - track.t0) / (track.t1 - track.t0)));
  }
  const hand = (id) => (pos[id] ? { x: pos[id].x + BALL_OFFSET.x, y: pos[id].y + BALL_OFFSET.y } : null);
  let ball = null;
  let holder = null;
  const seg = tl.ball.find((s) => t >= s.t0 && t <= s.t1) || tl.ball[tl.ball.length - 1];
  if (seg) {
    if (seg.kind === 'held') {
      holder = seg.by;
      ball = hand(seg.by);
    } else {
      const a = hand(seg.from);
      const b = hand(seg.to);
      ball = a && b ? lerp(a, b, ease((t - seg.t0) / (seg.t1 - seg.t0))) : a || b;
    }
  }
  return { pos, ball, holder };
}

/**
 * Fill in what hand-written plays leave out. A play may give only `start`
 * (positions before step 1) and `ball` (first holder); each step's `pos` and
 * `holder` are then carried forward from the previous step's actions, and a
 * path may list just its waypoints and end point. Plays that already spell
 * out `pos` on every step (the importer's output) pass through unchanged.
 */
export function normalizePlay(play) {
  const first = play.start || play.steps[0]?.pos || {};
  const order = (id) => (id[0] === 'x' ? 100 : 0) + Number(id.slice(1));
  const players = play.players || Object.keys(first).sort((a, b) => order(a) - order(b));
  let pos = Object.fromEntries(Object.entries(first).map(([id, p]) => [id, pt(p)]));
  let holder = play.ball || null;
  const steps = play.steps.map((raw) => {
    const here = raw.pos ? stepPositions(raw) : { ...pos };
    const actions = (raw.actions || []).map((a) => {
      if (!a.path) return a;
      const path = a.path.map(pt);
      if (here[a.player] && dist(path[0], here[a.player]) > 1) path.unshift(here[a.player]);
      return { ...a, path };
    });
    const step = { ...raw, actions, pos: here, holder: raw.holder !== undefined ? raw.holder : holder };
    pos = { ...here };
    for (const a of actions) {
      if (MOVE_TYPES.includes(a.type) && a.path?.length) pos[a.player] = a.path[a.path.length - 1];
    }
    holder = endHolder(step);
    return step;
  });
  return { ...play, players, steps };
}

/** Timelines for every step. Expects a normalized play. */
export function buildPlay(play) {
  return play.steps.map((_, i) => buildStep(play, i));
}
