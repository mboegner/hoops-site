// Animated play viewer. Usage: mountPlayer(containerElement, play).
import { buildPlay, frameAt, normalizePlay, pathLength, pointAlong } from './timeline.js';
import { drawBall, drawCourt, el } from './court.js';

const TOKEN_R = 17;
const STEP_GAP = 0.7; // pause between steps when playing the whole play
const LOOP_GAP = 2; // pause on the last frame before autoplay starts over
const SPEEDS = [1, 0.5];

const d = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

function endDirection(pts) {
  const len = Math.max(pathLength(pts), 1);
  const a = pointAlong(pts, Math.max(0, 1 - 14 / len));
  const b = pts[pts.length - 1];
  const n = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / n, y: (b.y - a.y) / n };
}

function trimEnd(pts, amount) {
  const len = pathLength(pts);
  if (len <= amount + 4) return pts;
  const out = [];
  let run = 0;
  for (let i = 0; i < pts.length; i += 1) {
    if (i) run += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (run <= len - amount) out.push(pts[i]);
  }
  out.push(pointAlong(pts, (len - amount) / len));
  return out;
}

function wavy(pts, amplitude = 6, wavelength = 22, straightTail = 24) {
  const len = pathLength(pts);
  if (len < straightTail * 2) return pts;
  const out = [];
  const samples = Math.ceil(len / 3);
  for (let i = 0; i <= samples; i += 1) {
    const at = (i / samples) * len;
    const p = pointAlong(pts, at / len);
    const q = pointAlong(pts, Math.min(at + 1, len) / len);
    const n = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const fade = Math.min(1, at / 10, Math.max(0, (len - straightTail - at) / 10));
    const off = Math.sin((at / wavelength) * Math.PI * 2) * amplitude * fade;
    out.push({ x: p.x - ((q.y - p.y) / n) * off, y: p.y + ((q.x - p.x) / n) * off });
  }
  return out;
}

function arrowHead(group, tip, dir, cls) {
  const size = 15;
  const bx = tip.x - dir.x * size;
  const by = tip.y - dir.y * size;
  const w = size * 0.5;
  el('path', {
    d: `M ${tip.x} ${tip.y} L ${bx - dir.y * w} ${by + dir.x * w} L ${bx + dir.y * w} ${by - dir.x * w} Z`,
    class: `bp-arrow ${cls}`,
  }, group);
}

function bar(group, at, dir, cls, half = 13) {
  el('line', {
    x1: at.x - dir.y * half, y1: at.y + dir.x * half,
    x2: at.x + dir.y * half, y2: at.y - dir.x * half,
    class: `bp-line ${cls}`,
  }, group);
}

function drawLines(group, tl) {
  group.replaceChildren();
  for (const track of Object.values(tl.tracks)) {
    if (track.type === 'drift') continue;
    const cls = `bp-${track.type}`;
    const dir = endDirection(track.path);
    const tip = track.path[track.path.length - 1];
    if (track.type === 'screen' || track.type === 'handoff') {
      el('path', { d: d(track.path), class: `bp-line ${cls}` }, group);
      if (track.type === 'screen') {
        // The bar sits just ahead of the screener, so it still shows once they arrive.
        bar(group, { x: tip.x + dir.x * (TOKEN_R + 4), y: tip.y + dir.y * (TOKEN_R + 4) }, dir, cls, 15);
      } else {
        bar(group, tip, dir, cls);
        bar(group, { x: tip.x - dir.x * 7, y: tip.y - dir.y * 7 }, dir, cls);
      }
    } else {
      const body = trimEnd(track.type === 'dribble' ? wavy(track.path) : track.path, 10);
      el('path', { d: d(body), class: `bp-line ${cls}` }, group);
      arrowHead(group, tip, dir, cls);
    }
  }
  const between = (from, to, cls) => {
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const dir = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
    const a = { x: from.x + dir.x * (TOKEN_R + 4), y: from.y + dir.y * (TOKEN_R + 4) };
    const tip = { x: to.x - dir.x * (TOKEN_R + 4), y: to.y - dir.y * (TOKEN_R + 4) };
    el('path', { d: d([a, { x: tip.x - dir.x * 10, y: tip.y - dir.y * 10 }]), class: `bp-line ${cls}` }, group);
    arrowHead(group, tip, dir, cls);
  };
  if (tl.pass && tl.passWindow) {
    between(frameAt(tl, tl.passWindow.t0).pos[tl.pass.from], frameAt(tl, tl.passWindow.t1).pos[tl.pass.to], 'bp-pass');
  }
  // A "look" is a pass the ball handler reads but does not throw in this step.
  const end = frameAt(tl, tl.duration).pos;
  for (const look of tl.looks) between(end[look.from], end[look.to], 'bp-look');
}

function make(tag, cls, parent, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function button(label, cls, parent) {
  const b = make('button', cls, parent, label);
  b.type = 'button';
  return b;
}

// The always-visible summary: what the play is for and where the shot comes from.
function buildBrief(parent, play) {
  const rows = [
    ['Goal', play.goal],
    ['Options', play.options],
    ['Use against', play.versus],
  ].filter(([, text]) => text);
  if (!rows.length) return;
  const brief = make('dl', 'bp-brief', parent);
  for (const [label, text] of rows) {
    make('dt', '', brief, label);
    make('dd', '', brief, text);
  }
}

export function mountPlayer(container, rawPlay) {
  const play = normalizePlay(rawPlay);
  const timelines = buildPlay(play);
  const last = timelines.length - 1;
  const state = { step: 0, t: 0, playing: false, whole: false, auto: false, speed: 0 };
  // Autoplay runs only until the viewer touches a control. After that the
  // play moves only when they ask it to.
  let touched = false;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const takeOver = () => {
    touched = true;
    state.auto = false;
  };

  container.classList.add('bp-player');
  container.classList.toggle('bp-full', play.court === 'full');
  container.replaceChildren();

  const head = make('header', 'bp-head', container);
  make('h2', 'bp-title', head, play.name);
  if (play.subtitle) make('p', 'bp-subtitle', head, play.subtitle);

  const stage = make('div', 'bp-stage', container);
  const svg = el('svg', { class: 'bp-court', role: 'img', 'aria-label': `${play.name}, animated diagram` });
  stage.appendChild(svg);
  drawCourt(svg, play.court, play.level);
  const lines = el('g', { class: 'bp-lines' }, svg);
  const tokenLayer = el('g', {}, svg);
  const tokens = {};
  for (const id of play.players) {
    const defense = id[0] === 'x';
    const g = el('g', { class: `bp-token ${defense ? 'bp-defense' : 'bp-offense'}` }, tokenLayer);
    el('circle', { r: TOKEN_R }, g);
    const text = el('text', { 'text-anchor': 'middle', dy: '0.36em' }, g);
    text.textContent = defense ? `X${id.slice(1)}` : id.slice(1);
    tokens[id] = g;
  }
  const ball = drawBall(svg);

  const controls = make('div', 'bp-controls', stage);
  const backBtn = button('Back', 'bp-btn', controls);
  const playBtn = button('Play all', 'bp-btn bp-primary', controls);
  const nextBtn = button('Next step', 'bp-btn', controls);
  const speedBtn = button('1×', 'bp-btn bp-speed', controls);
  speedBtn.setAttribute('aria-label', 'Animation speed');

  buildBrief(container, play);

  // Every step's help text stays on screen; the current one is emphasised.
  const stepList = make('ol', 'bp-steps', container);
  const stepEls = play.steps.map((step, i) => {
    const li = make('li', '', stepList);
    const b = button('', 'bp-step', li);
    make('span', 'bp-step-num', b, String(i + 1));
    const text = make('span', 'bp-step-text', b, step.note || 'No note for this step.');
    text.classList.toggle('bp-empty', !step.note);
    make('i', '', b);
    b.addEventListener('click', () => {
      takeOver();
      playStep(i);
    });
    return b;
  });

  let shownStep = -1;
  function render() {
    const tl = timelines[state.step];
    if (shownStep !== state.step) {
      shownStep = state.step;
      drawLines(lines, tl);
    }
    const frame = frameAt(tl, state.t);
    for (const [id, g] of Object.entries(tokens)) {
      const p = frame.pos[id];
      g.style.display = p ? '' : 'none';
      if (p) g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    }
    ball.style.display = frame.ball ? '' : 'none';
    if (frame.ball) ball.setAttribute('transform', `translate(${frame.ball.x.toFixed(1)} ${frame.ball.y.toFixed(1)})`);
    stepEls.forEach((b, i) => {
      const current = i === state.step;
      b.classList.toggle('is-current', current);
      b.classList.toggle('is-done', i < state.step);
      if (current) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
      b.lastElementChild.style.transform = `scaleX(${current ? Math.min(state.t / tl.duration, 1) : 0})`;
    });
    playBtn.textContent = state.playing ? 'Pause' : 'Play all';
    nextBtn.disabled = state.step === last && state.t >= tl.duration;
    backBtn.disabled = state.step === 0 && state.t === 0;
  }

  let raf = 0;
  let lastTime = 0;
  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1) * SPEEDS[state.speed];
    lastTime = now;
    const tl = timelines[state.step];
    state.t += dt;
    const more = state.whole && state.step < last;
    const limit = tl.duration + (more ? STEP_GAP : state.auto ? LOOP_GAP : 0);
    if (state.t >= limit) {
      if (more) {
        state.step += 1;
        state.t = 0;
      } else if (state.auto) {
        state.step = 0;
        state.t = 0;
      } else {
        state.t = tl.duration;
        state.playing = false;
      }
    }
    render();
    if (state.playing) raf = requestAnimationFrame(tick);
  }
  function start() {
    cancelAnimationFrame(raf);
    state.playing = true;
    lastTime = performance.now();
    raf = requestAnimationFrame(tick);
    render();
  }
  function stop() {
    cancelAnimationFrame(raf);
    state.playing = false;
    render();
  }
  function playStep(i) {
    state.step = i;
    state.t = 0;
    state.whole = false;
    start();
  }
  // Called by the page as the play scrolls into or out of the middle of the screen.
  function setCentered(centered) {
    if (touched || reducedMotion) return;
    if (centered && !state.auto) {
      state.auto = true;
      state.whole = true;
      start();
    } else if (!centered && state.auto) {
      state.auto = false;
      stop();
    }
  }
  function seek(step, t = 0) {
    takeOver();
    cancelAnimationFrame(raf);
    state.playing = false;
    state.step = Math.min(Math.max(step, 0), last);
    state.t = Math.min(Math.max(t, 0), timelines[state.step].duration);
    render();
  }

  playBtn.addEventListener('click', () => {
    takeOver();
    if (state.playing) return stop();
    if (state.step === last && state.t >= timelines[last].duration) {
      state.step = 0;
      state.t = 0;
    }
    state.whole = true;
    start();
  });
  // Next: run the step on screen if it has not finished, otherwise the next one.
  nextBtn.addEventListener('click', () => {
    takeOver();
    const finished = state.t >= timelines[state.step].duration;
    if (finished && state.step < last) playStep(state.step + 1);
    else if (!finished) {
      state.whole = false;
      start();
    }
  });
  // Back: rewind this step, or go to the start of the previous one.
  backBtn.addEventListener('click', () => {
    takeOver();
    if (state.t === 0 && state.step > 0) state.step -= 1;
    state.t = 0;
    stop();
  });
  speedBtn.addEventListener('click', () => {
    takeOver();
    state.speed = (state.speed + 1) % SPEEDS.length;
    speedBtn.textContent = `${SPEEDS[state.speed]}×`;
  });

  render();
  return { state, stage, timelines, playStep, seek, setCentered, stop };
}
