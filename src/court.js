// SVG court drawn to scale from rule-book dimensions, 10 units per foot.
// Basket at the top; the court is 50 ft wide, centred on x=260, with the
// baseline at y=40. Youth / high school markings follow NFHS: 12 ft lane,
// free-throw line 19 ft from the baseline, 19 ft 9 in three-point arc,
// backboard 4 ft and rim centre 5 ft 3 in from the baseline.

const NS = 'http://www.w3.org/2000/svg';
export const CENTER_X = 260;
const BASELINE = 40;
const WIDTH = 500;
const LEFT = CENTER_X - WIDTH / 2;
const RIGHT = CENTER_X + WIDTH / 2;

export const LEVELS = {
  youth: { length: 840, lane: 120, three: 197.5, corner: 0, restricted: 0 },
  college: { length: 940, lane: 120, three: 221.46, corner: 216.5, restricted: 40 },
  nba: { length: 940, lane: 160, three: 237.5, corner: 220, restricted: 40 },
  fiba: { length: 918.6, lane: 160.8, three: 221.5, corner: 216.5, restricted: 41 },
};

export function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

export function courtSize(court, level) {
  const spec = LEVELS[level] || LEVELS.youth;
  const playing = court === 'full' ? spec.length : spec.length / 2;
  return { x: -20, y: 0, width: 560, height: playing + 2 * BASELINE, spec, playing };
}

// One end of the floor. dir = 1 for the top basket, -1 for the bottom one.
function drawEnd(g, spec, baseY, dir) {
  const rimY = baseY + 52.5 * dir;
  const boardY = baseY + 40 * dir;
  const ftY = baseY + 190 * dir;
  const half = spec.lane / 2;
  const at = (feet) => baseY + feet * 10 * dir;

  // Lane (the painted key) and its outline.
  el('rect', { x: CENTER_X - half, y: Math.min(baseY, ftY), width: spec.lane, height: 190, class: 'court-paint' }, g);
  el('rect', { x: CENTER_X - half, y: Math.min(baseY, ftY), width: spec.lane, height: 190, class: 'court-line' }, g);

  // Lane-space marks: the block 7-8 ft from the baseline, then marks at 11, 14 and 17 ft.
  for (const side of [-1, 1]) {
    const x = CENTER_X + side * half;
    el('rect', {
      x: side === 1 ? x : x - 8, y: Math.min(at(7), at(8)), width: 8, height: 10, class: 'court-mark',
    }, g);
    for (const feet of [11, 14, 17]) {
      el('line', { x1: x, x2: x + side * 8, y1: at(feet), y2: at(feet), class: 'court-line' }, g);
    }
  }

  // Free-throw circle: solid half toward midcourt, dashed half inside the lane.
  const out = dir === 1 ? 0 : 1;
  el('path', { d: `M ${CENTER_X - 60} ${ftY} A 60 60 0 0 ${out} ${CENTER_X + 60} ${ftY}`, class: 'court-line' }, g);
  el('path', { d: `M ${CENTER_X - 60} ${ftY} A 60 60 0 0 ${1 - out} ${CENTER_X + 60} ${ftY}`, class: 'court-line court-dash' }, g);

  // Three-point line: straight from the baseline, then the arc around the rim.
  const r = spec.three;
  const cornerX = spec.corner || r;
  const meet = spec.corner ? rimY + dir * Math.sqrt(Math.max(r * r - cornerX * cornerX, 0)) : rimY;
  el('path', {
    d: `M ${CENTER_X - cornerX} ${baseY} L ${CENTER_X - cornerX} ${meet} A ${r} ${r} 0 0 ${out} ${CENTER_X + cornerX} ${meet} L ${CENTER_X + cornerX} ${baseY}`,
    class: 'court-line',
  }, g);

  if (spec.restricted) {
    el('path', {
      d: `M ${CENTER_X - spec.restricted} ${rimY} A ${spec.restricted} ${spec.restricted} 0 0 ${out} ${CENTER_X + spec.restricted} ${rimY}`,
      class: 'court-line',
    }, g);
  }

  // 28-foot marks on both sidelines.
  for (const x of [LEFT, RIGHT]) {
    el('line', { x1: x, x2: x + (x === LEFT ? 20 : -20), y1: at(28), y2: at(28), class: 'court-line' }, g);
  }

  // Basket from above: backboard, the neck that holds the rim, rim and net.
  el('line', { x1: CENTER_X - 30, x2: CENTER_X + 30, y1: boardY, y2: boardY, class: 'court-board' }, g);
  el('line', { x1: CENTER_X, x2: CENTER_X, y1: boardY, y2: rimY - 7.5 * dir, class: 'court-neck' }, g);
  el('circle', { cx: CENTER_X, cy: rimY, r: 5, class: 'court-net' }, g);
  el('circle', { cx: CENTER_X, cy: rimY, r: 7.5, class: 'court-rim' }, g);
}

let patternCount = 0;

export function drawCourt(svg, court = 'half', level = 'youth') {
  const size = courtSize(court, level);
  svg.setAttribute('viewBox', `${size.x} ${size.y} ${size.width} ${size.height}`);
  const g = el('g', { class: 'court' }, svg);

  // Hardwood: floor colour plus faint board seams running the length of the court.
  patternCount += 1;
  const woodId = `bp-wood-${patternCount}`;
  const defs = el('defs', {}, g);
  const wood = el('pattern', { id: woodId, width: 12.5, height: 120, patternUnits: 'userSpaceOnUse' }, defs);
  el('line', { x1: 0, x2: 0, y1: 0, y2: 120, class: 'court-seam' }, wood);
  el('line', { x1: 0, x2: 12.5, y1: 45, y2: 45, class: 'court-seam' }, wood);

  el('rect', { x: size.x, y: size.y, width: size.width, height: size.height, class: 'court-apron' }, g);
  el('rect', { x: LEFT, y: BASELINE, width: WIDTH, height: size.playing, class: 'court-floor' }, g);
  el('rect', { x: LEFT, y: BASELINE, width: WIDTH, height: size.playing, fill: `url(#${woodId})` }, g);

  drawEnd(g, size.spec, BASELINE, 1);
  const midY = BASELINE + size.spec.length / 2;
  if (court === 'full') {
    drawEnd(g, size.spec, BASELINE + size.spec.length, -1);
    el('line', { x1: LEFT, x2: RIGHT, y1: midY, y2: midY, class: 'court-line' }, g);
    el('circle', { cx: CENTER_X, cy: midY, r: 60, class: 'court-line' }, g);
    el('circle', { cx: CENTER_X, cy: midY, r: 20, class: 'court-line' }, g);
  } else {
    el('path', { d: `M ${CENTER_X - 60} ${midY} A 60 60 0 0 1 ${CENTER_X + 60} ${midY}`, class: 'court-line' }, g);
    el('path', { d: `M ${CENTER_X - 20} ${midY} A 20 20 0 0 1 ${CENTER_X + 20} ${midY}`, class: 'court-line' }, g);
  }
  // Boundary lines last so they sit on top of everything else.
  el('rect', { x: LEFT, y: BASELINE, width: WIDTH, height: size.playing, class: 'court-line court-boundary' }, g);
  return size;
}

/** A basketball seen from the side: orange with the four seam lines. */
export function drawBall(parent, r = 9.5) {
  const g = el('g', { class: 'bp-ball' }, parent);
  el('circle', { r, class: 'bp-ball-skin' }, g);
  const k = r * 0.72;
  const seams = [
    `M ${-r} 0 H ${r}`,
    `M 0 ${-r} V ${r}`,
    `M ${-k} ${-k} Q ${-r * 0.22} 0 ${-k} ${k}`,
    `M ${k} ${-k} Q ${r * 0.22} 0 ${k} ${k}`,
  ];
  for (const d of seams) el('path', { d, class: 'bp-ball-seam' }, g);
  return g;
}
