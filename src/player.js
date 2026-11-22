// Animated play viewer. Usage: mountPlayer(containerElement, play).
import { buildPlay, frameAt, pathLength, pointAlong } from './timeline.js';
import { drawCourt, el } from './court.js';

const TOKEN_R = 17;
const STEP_GAP = 0.7; // pause between steps when playing the whole play
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
  const keep = (len - amount) / len;
  const out = [];
  let run = 0;
  for (let i = 0; i < pts.length; i += 1) {
    if (i) run += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (run <= len - amount) out.push(pts[i]);
  }
  out.push(pointAlong(pts, keep));
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
      bar(group, tip, dir, cls);
      if (track.type === 'handoff') bar(group, { x: tip.x - dir.x * 7, y: tip.y - dir.y * 7 }, dir, cls);
    } else {
      const body = trimEnd(track.type === 'dribble' ? wavy(track.path) : track.path, 10);
      el('path', { d: d(body), class: `bp-line ${cls}` }, group);
      arrowHead(group, tip, dir, cls);
    }
  }
  if (tl.pass && tl.passWindow) {
    const from = frameAt(tl, tl.passWindow.t0).pos[tl.pass.from];
    const to = frameAt(tl, tl.passWindow.t1).pos[tl.pass.to];
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const dir = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
    const a = { x: from.x + dir.x * (TOKEN_R + 4), y: from.y + dir.y * (TOKEN_R + 4) };
    const tip = { x: to.x - dir.x * (TOKEN_R + 4), y: to.y - dir.y * (TOKEN_R + 4) };
    el('path', { d: d([a, { x: tip.x - dir.x * 10, y: tip.y - dir.y * 10 }]), class: 'bp-line bp-pass' }, group);
    arrowHead(group, tip, dir, 'bp-pass');
  }
}

function button(label, cls, parent) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  parent.appendChild(b);
  return b;
}

export function mountPlayer(container, play) {
  const timelines = buildPlay(play);
  const last = timelines.length - 1;
  const state = { step: 0, t: 0, playing: false, whole: false, speed: 0 };

  container.classList.add('bp-player');
  container.replaceChildren();
  const title = document.createElement('h2');
  title.className = 'bp-title';
  title.textContent = play.name;
  container.appendChild(title);

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'bp-court');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${play.name}, animated diagram`);
  container.appendChild(svg);
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
  const ball = el('circle', { r: 8, class: 'bp-ball' }, svg);

  // The step note is always part of the player; it is never optional.
  const note = document.createElement('div');
  note.className = 'bp-note';
  note.setAttribute('aria-live', 'polite');
  const noteLabel = document.createElement('strong');
  const noteText = document.createElement('p');
  note.append(noteLabel, noteText);
  container.appendChild(note);

  const dots = document.createElement('div');
  dots.className = 'bp-dots';
  const dotEls = timelines.map((_, i) => {
    const b = button(String(i + 1), 'bp-dot', dots);
    b.setAttribute('aria-label', `Step ${i + 1}`);
    b.appendChild(document.createElement('i'));
    b.addEventListener('click', () => playStep(i));
    return b;
  });
  container.appendChild(dots);

  const controls = document.createElement('div');
  controls.className = 'bp-controls';
  const backBtn = button('Back', 'bp-btn', controls);
  const playBtn = button('Play all', 'bp-btn bp-primary', controls);
  const nextBtn = button('Next step', 'bp-btn', controls);
  const speedBtn = button('1×', 'bp-btn bp-speed', controls);
  speedBtn.setAttribute('aria-label', 'Animation speed');
  container.appendChild(controls);

  let shownStep = -1;
  function render() {
    const tl = timelines[state.step];
    if (shownStep !== state.step) {
      shownStep = state.step;
      drawLines(lines, tl);
      noteLabel.textContent = `Step ${state.step + 1} of ${timelines.length}`;
      const text = play.steps[state.step].note;
      noteText.textContent = text || 'No note for this step.';
      noteText.classList.toggle('bp-empty', !text);
    }
    const frame = frameAt(tl, state.t);
    for (const [id, g] of Object.entries(tokens)) {
      const p = frame.pos[id];
      g.style.display = p ? '' : 'none';
      if (p) g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    }
    ball.style.display = frame.ball ? '' : 'none';
    if (frame.ball) {
      ball.setAttribute('cx', frame.ball.x.toFixed(1));
      ball.setAttribute('cy', frame.ball.y.toFixed(1));
    }
    dotEls.forEach((dot, i) => {
      dot.classList.toggle('is-current', i === state.step);
      dot.classList.toggle('is-done', i < state.step);
      const fill = i < state.step ? 1 : i === state.step ? Math.min(state.t / tl.duration, 1) : 0;
      dot.firstElementChild.style.transform = `scaleX(${fill})`;
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
    const limit = tl.duration + (state.whole && state.step < last ? STEP_GAP : 0);
    if (state.t >= limit) {
      if (state.whole && state.step < last) {
        state.step += 1;
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

  playBtn.addEventListener('click', () => {
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
    const finished = state.t >= timelines[state.step].duration;
    if (finished && state.step < last) playStep(state.step + 1);
    else if (!finished) {
      state.whole = false;
      start();
    }
  });
  // Back: rewind this step, or go to the start of the previous one.
  backBtn.addEventListener('click', () => {
    if (state.t === 0 && state.step > 0) state.step -= 1;
    state.t = 0;
    stop();
  });
  speedBtn.addEventListener('click', () => {
    state.speed = (state.speed + 1) % SPEEDS.length;
    speedBtn.textContent = `${SPEEDS[state.speed]}×`;
  });

  function seek(step, t = 0) {
    cancelAnimationFrame(raf);
    state.playing = false;
    state.step = Math.min(Math.max(step, 0), last);
    state.t = Math.min(Math.max(t, 0), timelines[state.step].duration);
    render();
  }

  render();
  return { state, timelines, playStep, seek, stop };
}
