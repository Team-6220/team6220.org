// Event: weigh-in, pit fixes, then six watched qualification matches, alliance selection and playoffs.
import { h, clear, C, sfx } from '../ui.js';
import { archList } from '../data/archetypes.js';
import { PRINCIPLE_MAP } from '../data/principles.js';
import { derive } from '../sim/robotModel.js';
import { simulateEvent, eventScore, MATCHES_PER_EVENT } from '../sim/match.js';
import { playMatchView, MATCH_VIEW_SIZE } from '../sim/matchView.js';
import { applySkips } from '../sim/skips.js';
import { spend, unlock, setSlot, addFlaw, save } from '../state.js';
import { shell, hint } from './common.js';

// Rank history chart: rank 1 at the top, 24 at the bottom.
export function rankChart(path, w, hgt) {
  const cv = h('canvas', { width: w, height: hgt });
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.black; ctx.fillRect(0, 0, w, hgt);
  const L = 34, R = 12, T = 12, B = 20;
  const x = (i) => L + (path.length <= 1 ? 0 : (i / (path.length - 1)) * (w - L - R));
  const y = (r) => T + ((r - 1) / 23) * (hgt - T - B);
  ctx.strokeStyle = C.g4; ctx.lineWidth = 1; ctx.fillStyle = C.g5; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
  [1, 8, 16, 24].forEach((r) => { ctx.beginPath(); ctx.moveTo(L, y(r)); ctx.lineTo(w - R, y(r)); ctx.stroke(); ctx.fillText('#' + r, L - 6, y(r) + 4); });
  ctx.setLineDash([4, 4]); ctx.strokeStyle = C.gold; ctx.beginPath(); ctx.moveTo(L, y(8)); ctx.lineTo(w - R, y(8)); ctx.stroke(); ctx.setLineDash([]);
  ctx.textAlign = 'center'; ctx.fillStyle = C.g5;
  path.forEach((_, i) => ctx.fillText('M' + (i + 1), x(i), hgt - 5));
  ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.beginPath();
  path.forEach((r, i) => { if (i === 0) ctx.moveTo(x(i), y(r)); else ctx.lineTo(x(i), y(r)); });
  ctx.stroke();
  path.forEach((r, i) => { ctx.fillStyle = C.gold; ctx.fillRect(x(i) - 4, y(r) - 4, 8, 8); ctx.fillStyle = C.white; ctx.textAlign = 'center'; ctx.fillText(r, x(i), y(r) - 8); });
  return cv;
}

export function mount(root, run, done, node) {
  const idx = node.params.idx;
  const evName = idx === 1 ? 'Regional event' : 'Championship';
  let res = null, viewer = null;
  for (const slot of ['drivetrain', 'intake', 'scorer']) if (!run.design[slot]) setSlot(slot, archList(run.seasonId, slot)[0].id, 'scratch', true);
  if (!run.design.endgame) setSlot('endgame', 'none', 'scratch', false);
  const fixCost = (f) => Math.ceil(f.fixHours * 1.5);
  const skipMsgs = run.skipsApplied ? [] : applySkips(run);
  const stop = () => { if (viewer) { viewer.stop(); viewer = null; } };

  function prep() {
    stop(); clear(root);
    const s = derive(run);
    const rows = run.flaws.filter((f) => f.found && !f.fixed);
    const unknown = run.flaws.some((f) => !f.found && !f.fixed);
    root.append(shell(idx === 1 ? 'Regional event: pit and weigh-in' : 'Championship: pit and weigh-in', 'Inspection comes before the first match.',
      hint(run, 'You are over the weight limit? That is a late-season scramble. Plan weight early instead.'),
      skipMsgs.length ? h('div', { class: 'panel' }, h('h3', { class: 'gold' }, 'Skipped steps catch up with you'), ...skipMsgs.map((m) => h('div', { class: 'small' }, m))) : null,
      s.over ? h('div', { class: 'panel col' }, h('h3', { class: 'red' }, `Overweight: ${Math.round(s.weight)} / ${s.cap} lb`),
        h('p', {}, 'You cannot compete until you are under the limit. Late fixes are expensive.'),
        h('button', { class: 'btn', onclick: () => { run.results.shop = run.results.shop || { weightDelta: 0, sensors: null, applied: {}, progExtra: 0 }; run.results.shop.weightDelta -= 8; spend(10); addFlaw({ id: 'drilled' + Math.round(s.weight), name: 'Holes drilled in a rush weaken a part', sev: 0.3, kind: 'cycles', fixHours: 5, onlyTesting: true, hint: 'Lightening should be planned, not panicked.', found: false }); unlock('pocket-last'); prep(); } }, 'Drill lightening holes in a hurry (-8 lb, 10 h, weakens parts)'),
        run.design.endgame && run.design.endgame.id !== 'none' ? h('button', { class: 'btn', onclick: () => { setSlot('endgame', 'none', 'scratch', false); unlock('build-less'); prep(); } }, 'Remove the endgame mechanism (build less robot)') : null)
        : h('div', { class: 'panel green' }, `Weigh-in passed: ${Math.round(s.weight)} / ${s.cap} lb.`),
      h('div', { class: 'panel' }, h('h3', {}, 'Known issues (pit fixes cost 1.5x)'),
        rows.length ? h('table', {}, ...rows.map((f) => h('tr', {}, h('td', {}, f.name), h('td', {}, h('button', { class: 'btn', onclick: () => { f.fixed = true; spend(fixCost(f)); save(); prep(); } }, `Fix (${fixCost(f)} h)`)))))
          : h('p', { class: 'muted' }, 'None known.'),
        unknown ? h('p', { class: 'small gold' }, 'There may be issues you have not found yet.') : null),
      h('button', { class: 'btn primary', disabled: s.over ? true : null, onclick: () => { res = simulateEvent(run, idx); playQual(0); } }, 'Start qualification matches')));
  }

  // ---- A single watched match ----
  function matchScreen(m, opts) {
    stop(); clear(root);
    const cv = h('canvas', { width: MATCH_VIEW_SIZE.W, height: MATCH_VIEW_SIZE.H });
    const feed = h('div', { class: 'feed small' });
    const speedBtns = h('div', { class: 'row' });
    const after = h('div', {});
    const nextBox = h('div', { class: 'col' });
    const log = (t, text, cls) => {
      feed.prepend(h('div', { class: cls || '' }, h('span', { class: 'mono muted' }, `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} `), text));
    };
    const side = h('div', { class: 'col', style: 'width:430px' },
      opts.sideTop,
      h('div', { class: 'panel col' }, h('b', {}, 'Commentary'), h('div', { class: 'muted small' }, 'Watch your robot (white outline, 6220). Gold alliance is yours; blue is the opponent.'), feed),
      speedBtns, nextBox);
    const setSpeedBtn = (label, sp) => h('button', { class: 'btn', onclick: () => { if (viewer) viewer.setSpeed(sp); } }, label);
    speedBtns.append(setSpeedBtn('Normal', 10), setSpeedBtn('Fast', 30), h('button', { class: 'btn', onclick: () => { if (viewer) viewer.skip(); } }, 'Skip to result'));
    root.append(shell(opts.title, opts.sub, opts.banner ? h('div', { class: 'panel hint' }, opts.banner) : null, h('div', { class: 'row' }, h('div', { class: 'col' }, cv), side), after));
    viewer = playMatchView(cv, m, {
      speed: 10, onEvent: log,
      onDone: () => {
        speedBtns.style.display = 'none';
        m.moments.forEach((mo) => mo.principle && unlock(mo.principle));
        after.append(resultPanel(m, opts.extra));
        nextBox.append(h('button', { class: 'btn primary', onclick: opts.next }, opts.nextLabel), h('div', { class: 'small muted' }, 'Scroll down for the score breakdown and what happened to your robot.'));
      },
    });
  }

  function resultPanel(m, extra) {
    const row = (name, a, b) => h('tr', {}, h('td', {}, name), h('td', { class: 'mono' }, a), h('td', { class: 'mono' }, b));
    return h('div', { class: 'row' },
      h('div', { class: 'panel', style: 'width:430px' },
        h('h3', { class: m.win ? 'gold' : m.tie ? '' : 'red' }, `${m.win ? 'Win' : m.tie ? 'Tie' : 'Loss'}: ${m.alliance} to ${m.opp}`),
        h('table', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'You'), h('th', {}, 'Partners / opponent')),
          row('Autonomous', m.auto, ''), row('Teleop', m.tele, ''), row('Endgame', m.end, ''),
          row('Total', m.ours, `${m.partners} / ${m.opp}`)),
        h('div', { class: 'small muted', style: 'margin-top:6px' }, `You completed ${m.cycles} of about ${m.potential} possible cycles.` + (m.loss > 0.05 ? ' Breakdowns cost you cycle time.' : ' No downtime.')),
        extra || null),
      h('div', { class: 'panel grow col' },
        h('h3', {}, m.moments.length ? 'What happened to your robot' : 'A clean match'),
        m.moments.length ? m.moments.map((mo) => h('div', { class: 'small' }, h('b', { class: 'red' }, mo.title + ': '), mo.text,
          mo.principle && PRINCIPLE_MAP[mo.principle] ? h('div', { class: 'gold' }, 'Lesson: ' + PRINCIPLE_MAP[mo.principle].title) : null))
          : h('div', { class: 'small muted' }, 'Nothing broke. Reliability is a design feature too.'),
      ));
  }

  // ---- Qualification ----
  function qualSideTop(k) {
    const played = res.matches.slice(0, k);
    const wins = played.filter((m) => m.win).length, rpNow = played.reduce((a, m) => a + (m.win ? 2 : m.tie ? 1 : 0), 0);
    return h('div', { class: 'panel col' }, h('b', {}, `Record ${wins}-${played.length - wins} · ${rpNow} RP` + (k > 0 ? ` · rank ${res.rankPath[k - 1]}` : '')),
      k > 0 ? rankChart(res.rankPath.slice(0, k), 400, 120) : h('div', { class: 'small muted' }, 'Rank history appears after your first match.'));
  }
  function playQual(k) {
    const m = res.matches[k];
    const upto = k + 1;
    matchScreen(m, {
      title: `${evName}: ${m.stage}`, sub: 'Watch the match. You do not drive the robot, your design does.',
      sideTop: qualSideTop(k),
      nextLabel: k + 1 < MATCHES_PER_EVENT ? `Next match (${k + 2} of ${MATCHES_PER_EVENT})` : 'Qualifications over: alliance selection',
      extra: h('div', { class: 'small gold', style: 'margin-top:6px' }, `Rank after ${upto} ${upto === 1 ? 'match' : 'matches'}: ${res.rankPath[k]}`),
      next: () => (k + 1 < MATCHES_PER_EVENT ? playQual(k + 1) : selection()),
    });
  }

  // ---- Alliance selection ----
  function selection() {
    stop(); clear(root);
    const po = res.playoff;
    const msg = po.role === 'captain' ? `You finished as the #${res.rank} seed, so you are an alliance captain. You pick the two best partners left, and you carry real playoff hopes.`
      : po.role === 'picked' ? `You finished rank ${res.rank}. A captain noticed your robot and picked you. You join as seed ${po.seed}.`
        : `You finished rank ${res.rank} and no captain picked you. Your event ends here. Robots that score and break less get picked.`;
    root.append(shell(`${evName}: alliance selection`, `Qualification complete: ${res.wins}-${MATCHES_PER_EVENT - res.wins}, ${res.rp} RP, average ${res.avg.toFixed(0)} points.`,
      h('div', { class: 'row' },
        h('div', { class: 'panel col' }, h('h3', {}, 'Qualification rank'), rankChart(res.rankPath, 520, 190), h('div', { class: 'small muted' }, 'Gold dashed line: the top eight become alliance captains.')),
        h('div', { class: 'panel col grow' }, h('h3', { class: po.role === 'none' ? 'red' : 'gold' }, po.role === 'none' ? 'Not selected' : po.role === 'captain' ? 'Alliance captain' : 'Picked for an alliance'), h('p', {}, msg),
          po.role === 'none' ? h('div', { class: 'small muted' }, 'Strength in qualifications is what gets you chosen: cycle speed, reliability, and a robot that works every match.') : h('div', { class: 'small muted' }, 'Playoffs are best of three, single elimination: quarterfinals, semifinals, finals.'),
          h('div', { style: 'flex:1' }),
          h('button', { class: 'btn primary', style: 'align-self:flex-start', onclick: () => (po.role === 'none' ? summary() : playPlayoff(0)) }, po.role === 'none' ? 'Event summary' : 'Start playoffs')))));
  }

  function bracketPanel(upTo) {
    const po = res.playoff;
    if (po.role === 'none') return null;
    return h('div', { class: 'panel' }, h('h3', {}, `Playoff bracket (you are seed ${po.seed})`),
      h('div', { class: 'grid3' }, ...['Quarterfinals', 'Semifinals', 'Finals'].map((name, i) => {
        const rd = po.rounds[i];
        if (!rd) return h('div', { class: 'card', style: 'cursor:default;opacity:.45' }, h('b', {}, name), h('div', { class: 'small muted' }, i > 0 && po.rounds[i - 1] && !po.rounds[i - 1].won ? 'Eliminated before this round' : 'Not reached'));
        const reached = upTo >= i;
        return h('div', { class: 'card' + (rd.won ? ' sel' : ''), style: 'cursor:default' }, h('b', {}, name), h('div', { class: 'small' }, `vs seed ${rd.oppSeed}`),
          h('div', { class: 'small ' + (reached ? (rd.won ? 'gold' : 'red') : 'muted') }, reached ? `${rd.won ? 'Won' : 'Lost'} ${rd.score}` : 'to be played'));
      })));
  }

  // ---- Playoffs ----
  function playPlayoff(k) {
    const po = res.playoff;
    const items = po.rounds.flatMap((rd, ri) => rd.matches.map((m, mi) => ({ rd, ri, m, mi })));
    const it = items[k];
    const last = k === items.length - 1;
    const nxt = items[k + 1];
    const roundEnds = !nxt || nxt.ri !== it.ri;
    const banner = it.mi === 0 ? `${it.rd.name}: you face the #${it.rd.oppSeed} seed alliance. Best of three.` + (it.ri === 0 ? '' : ' You advanced, so the opposition gets tougher.') : null;
    const wins = it.rd.matches.slice(0, it.mi + 1).filter((x) => x.win).length, losses = it.mi + 1 - wins;
    const roundResult = roundEnds ? (it.rd.won ? `Round won ${it.rd.score}.` : `Round lost ${it.rd.score}. Your event ends here.`) : null;
    const finalOut = roundEnds && (!it.rd.won || last);
    matchScreen(it.m, {
      title: `${evName}: ${it.m.stage}`, sub: `Series: you ${wins}, them ${losses}`,
      banner,
      sideTop: h('div', { class: 'panel col' }, h('b', {}, `${it.rd.name} vs seed ${it.rd.oppSeed}`), h('div', { class: 'small muted' }, 'Best of three. Your alliance picks matter; so does your robot.')),
      extra: roundResult ? h('div', { class: it.rd.won ? 'small gold' : 'small red', style: 'margin-top:6px' }, roundResult + (it.rd.won && last ? ' You are the event winners!' : '')) : null,
      nextLabel: finalOut ? 'Event summary' : roundEnds ? `Next round: ${nxt.rd.name}` : 'Next match',
      next: () => (finalOut ? summary() : playPlayoff(k + 1)),
    });
  }

  // ---- Summary ----
  function summary() {
    stop(); clear(root);
    const po = res.playoff, score = eventScore(res);
    const incidents = [...res.matches, ...po.rounds.flatMap((r) => r.matches)].flatMap((m) => m.moments.filter((mo) => mo.principle).map((mo) => ({ title: mo.title, principle: mo.principle })));
    run.events.push({
      idx, rank: res.rank, wins: res.wins, rp: res.rp, avg: res.avg, score, rankPath: res.rankPath,
      playoff: { result: po.result, role: po.role, seed: po.seed, rounds: po.rounds.map((r) => ({ name: r.name, oppSeed: r.oppSeed, score: r.score, won: r.won })) },
      awards: res.awards.map((a) => a.name), incidents,
    });
    unlock('consistency');
    if (idx === 1) unlock('auton');
    if (res.dtFail > 0 || run.design.drivetrain.id !== 'swerve') unlock('drivetrain-king');
    save();
    sfx(po.result === 'Winner' ? 'win' : 'chime');
    const big = po.result === 'Winner' ? 'Event winners!' : po.result === 'Not selected' ? 'Qualifications only' : po.result;
    root.append(shell(`${evName}: complete`, null,
      h('div', { class: 'row' },
        h('div', { class: 'panel col grow' }, h('h3', {}, 'Result'),
          h('div', { style: 'font-size:30px', class: po.result === 'Winner' ? 'gold' : '' }, big),
          h('div', { class: 'small' }, `Qualifications: rank ${res.rank}, ${res.wins}-${MATCHES_PER_EVENT - res.wins}, average ${res.avg.toFixed(0)} points.`),
          po.role !== 'none' ? h('div', { class: 'small' }, `Alliance seed ${po.seed} (${po.role === 'captain' ? 'captain' : 'picked'}); playoffs: ` + po.rounds.map((r) => `${r.name} ${r.won ? 'won' : 'lost'} ${r.score}`).join(', ') + '.') : h('div', { class: 'small muted' }, 'No alliance picked you.'),
          rankChart(res.rankPath, 420, 140),
          h('div', { class: 'small gold' }, `Event score: +${score}  (play ${Math.round(res.avg * 0.5 + res.wins * 3 + Math.max(0, 25 - res.rank))}, playoffs ${po.bonus}, awards ${res.awards.length * 3})`)),
        h('div', { class: 'panel col grow' }, h('h3', {}, 'Awards'),
          res.awards.length ? res.awards.map((a) => h('div', {}, h('b', { class: 'gold' }, a.name), h('div', { class: 'small' }, a.why)))
            : h('div', { class: 'small muted' }, 'No awards this time. Awards go to robots that are reliable, well documented, well controlled, and built on shared knowledge. Tested, simple, organized designs earn them.'),
          h('div', { style: 'flex:1' }),
          h('button', { class: 'btn primary', style: 'align-self:flex-start', onclick: finish }, 'Continue the season'))),
      bracketPanel(99)));
  }

  function finish() { done(); }
  prep();
}
