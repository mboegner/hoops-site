// SVG court drawn from real court dimensions at 10 units per foot.
// Basket at the top; court is 50 ft wide, centred on x=260, baseline at y=40.

const NS = 'http://www.w3.org/2000/svg';
export const CENTER_X = 260;
const BASELINE = 40;
const WIDTH = 500;

export const LEVELS = {
  youth: { length: 840, lane: 120, three: 197.5, corner: 0 },
  college: { length: 940, lane: 120, three: 221.46, corner: 216.5 },
  nba: { length: 940, lane: 160, three: 237.5, corner: 220 },
  fiba: { length: 918.6, lane: 160.8, three: 221.5, corner: 216.5 },
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
  const ftY = baseY + 190 * dir;
  const half = spec.lane / 2;
  el('rect', { x: CENTER_X - half, y: Math.min(baseY, ftY), width: spec.lane, height: 190, class: 'court-paint' }, g);
  // Free-throw circle: solid half toward midcourt, dashed half in the lane.
  const out = dir === 1 ? 0 : 1;
  el('path', { d: `M ${CENTER_X - 60} ${ftY} A 60 60 0 0 ${out} ${CENTER_X + 60} ${ftY}`, class: 'court-line' }, g);
  el('path', { d: `M ${CENTER_X - 60} ${ftY} A 60 60 0 0 ${1 - out} ${CENTER_X + 60} ${ftY}`, class: 'court-line court-dash' }, g);
  // Three-point line.
  const r = spec.three;
  const sweep = dir === 1 ? 0 : 1;
  if (spec.corner) {
    const meet = rimY + dir * Math.sqrt(Math.max(r * r - spec.corner * spec.corner, 0));
    el('path', {
      d: `M ${CENTER_X - spec.corner} ${baseY} L ${CENTER_X - spec.corner} ${meet} A ${r} ${r} 0 0 ${sweep} ${CENTER_X + spec.corner} ${meet} L ${CENTER_X + spec.corner} ${baseY}`,
      class: 'court-line',
    }, g);
  } else {
    el('path', {
      d: `M ${CENTER_X - r} ${baseY} L ${CENTER_X - r} ${rimY} A ${r} ${r} 0 0 ${sweep} ${CENTER_X + r} ${rimY} L ${CENTER_X + r} ${baseY}`,
      class: 'court-line',
    }, g);
  }
  // Lane blocks.
  for (const side of [-1, 1]) {
    el('line', {
      x1: CENTER_X + side * half, x2: CENTER_X + side * (half + 8),
      y1: baseY + 70 * dir, y2: baseY + 70 * dir, class: 'court-line',
    }, g);
  }
  el('line', { x1: CENTER_X - 30, x2: CENTER_X + 30, y1: baseY + 40 * dir, y2: baseY + 40 * dir, class: 'court-board' }, g);
  el('circle', { cx: CENTER_X, cy: rimY, r: 7.5, class: 'court-rim' }, g);
}

export function drawCourt(svg, court = 'half', level = 'youth') {
  const size = courtSize(court, level);
  svg.setAttribute('viewBox', `${size.x} ${size.y} ${size.width} ${size.height}`);
  const g = el('g', { class: 'court' }, svg);
  el('rect', { x: size.x, y: size.y, width: size.width, height: size.height, class: 'court-apron' }, g);
  el('rect', { x: CENTER_X - WIDTH / 2, y: BASELINE, width: WIDTH, height: size.playing, class: 'court-floor' }, g);
  drawEnd(g, size.spec, BASELINE, 1);
  const midY = BASELINE + size.spec.length / 2;
  if (court === 'full') {
    drawEnd(g, size.spec, BASELINE + size.spec.length, -1);
    el('line', { x1: CENTER_X - WIDTH / 2, x2: CENTER_X + WIDTH / 2, y1: midY, y2: midY, class: 'court-line' }, g);
    el('circle', { cx: CENTER_X, cy: midY, r: 60, class: 'court-line' }, g);
  } else {
    el('path', { d: `M ${CENTER_X - 60} ${midY} A 60 60 0 0 1 ${CENTER_X + 60} ${midY}`, class: 'court-line' }, g);
  }
  el('rect', { x: CENTER_X - WIDTH / 2, y: BASELINE, width: WIDTH, height: size.playing, class: 'court-line' }, g);
  return size;
}
