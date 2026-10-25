// Event: weigh-in and pit fixes, then six watched qualification matches (scout, plan, repair between matches),
// alliance selection, best-of-three playoffs and awards.
import { h, clear, C, sfx } from '../ui.js';
import { archList } from '../data/archetypes.js';
import { PRINCIPLE_MAP } from '../data/principles.js';
import { derive } from '../sim/robotModel.js';
import { createEvent, eventScore, PLANS, STYLES, MATCHES_PER_EVENT } from '../sim/match.js';
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
  let ev = null, viewer = null;
  for (const slot of ['drivetrain', 'intake', 'scorer']) if (!run.design[slot]) setSlot(slot, archList(run.seasonId, slot)[0].id, 'scratch', true);
  if (!run.design.endgame) setSlot('endgame', 'none', 'scratch', false);
  const fixCost = (f) => Math.ceil(f.fixHours * 1.5);
  const partCost = (f) => Math.ceil(f.fixHours * 0.75);
  const skipMsgs = run.skipsApplied ? [] : applySkips(run);
  const stop = () => { if (viewer) { viewer.stop(); viewer = null; } };
  const res = () => ev.result();

  function prep() {
    stop(); clear(root);
    const s = derive(run);
    const rows = run.flaws.filter((f) => f.found && !f.fixed && f.kind !== 'part');
    const unknown = run.flaws.some((f) => !f.found && !f.fixed && f.kind !== 'part');
    const parts = run.flaws.filter((f) => f.kind === 'part' && !f.fixed);
    root.append(shell(idx === 1 ? 'Regional event: pit and weigh-in' : 'Championship: pit and weigh-in', 'Inspection comes before the first match.',
      hint(run, 'You are over the weight limit? That is a late-season scramble. Plan weight early instead.'),
      skipMsgs.length ? h('div', { class: 'panel' }, h('h3', { class: 'gold' }, 'Skipped steps catch up with you'), ...skipMsgs.map((m) => h('div', { class: 'small' }, m))) : null,
      s.over ? h('div', { class: 'panel col' }, h('h3', { class: 'red' }, `Overweight: ${Math.round(s.weight)} / ${s.cap} lb`),
        h('p', {}, 'You cannot compete until you are under the limit. Late fixes are expensive.'),
        h('button', { class: 'btn', onclick: () => { sfx('drill'); run.results.shop = run.results.shop || { weightDelta: 0, sensors: null, applied: {}, progExtra: 0 }; run.results.shop.weightDelta -= 8; spend(10); addFlaw({ id: 'drilled' + Math.round(s.weight), name: 'Holes drilled in a rush weaken a part', sev: 0.3, kind: 'cycles', fixHours: 5, onlyTesting: true, hint: 'Lightening should be planned, not panicked.', found: false }); unlock('pocket-last'); prep(); } }, 'Drill lightening holes in a hurry (-8 lb, 10 h, weakens parts)'),
        run.design.endgame && run.design.endgame.id !== 'none' ? h('button', { class: 'btn', onclick: () => { setSlot('endgame', 'none', 'scratch', false); unlock('build-less'); prep(); } }, 'Remove the endgame mechanism (build less robot)') : null)
        : h('div', { class: 'panel green' }, `Weigh-in passed: ${Math.round(s.weight)} / ${s.cap} lb.`),
      h('div', { class: 'panel' }, h('h3', {}, 'Known issues (pit fixes cost 1.5x)'),
        rows.length ? h('table', {}, ...rows.map((f) => h('tr', {}, h('td', {}, f.name), h('td', {}, h('button', { class: 'btn', onclick: () => { f.fixed = true; spend(fixCost(f)); sfx('drill'); save(); prep(); } }, `Fix (${fixCost(f)} h)`)))))
          : h('p', { class: 'muted' }, 'None known.'),
        unknown ? h('p', { class: 'small gold' }, 'There may be issues you have not found yet.') : null),
      parts.length ? h('div', { class: 'panel' }, h('h3', { class: 'gold' }, 'Missing and duplicate parts'),
        h('div', { class: 'small' }, 'These cost time, not matches: the team spends hours remaking and re-ordering parts before inspection.'),
        ...parts.map((f) => h('div', { class: 'small' }, `${f.name}: ${partCost(f)} h`)), h('div', { class: 'small gold' }, `Total: ${parts.reduce((a, f) => a + partCost(f), 0)} h from the season clock.`)) : null,
      h('button', { class: 'btn primary', disabled: s.over ? true : null, onclick: () => { parts.forEach((f) => { f.fixed = true; f.found = true; spend(partCost(f)); }); if (parts.length) { unlock('duplicates-bom'); sfx('drill'); } ev = createEvent(run, idx); prepMatch('q', 0); } }, 'Start qualification matches')));
  }

  // ---- Before every match: pit repairs, scouting report, match plan ----
  function prepMatch(kind, k, banner) {
    stop(); clear(root);
    const last = kind === 'q' ? (k > 0 ? ev.matches[k - 1] : null) : lastPlayed;
    const pk = kind === 'p' ? ev.peekPlayoff() : null;
    const sc = kind === 'q' ? ev.scout('q' + k) : pk.scout;
    const title = kind === 'q' ? `${evName}: qualification ${k + 1} of ${MATCHES_PER_EVENT}` : `${evName}: ${pk.name}, match ${pk.idx + 1}`;
    let plan = 'balanced';
    const planBox = h('div', { class: 'col' });
    const startBtn = h('button', { class: 'btn primary', onclick: () => { if (plan !== 'balanced') unlock('match-strategy'); sfx('confirm'); kind === 'q' ? playQual(k, plan) : playPlayoff(plan, banner); } }, 'Start the match');
    const drawPlans = () => {
      clear(planBox);
      Object.entries(PLANS).forEach(([id, p]) => planBox.append(h('div', { class: 'card' + (plan === id ? ' sel' : ''), onclick: () => { plan = id; drawPlans(); } }, h('b', {}, p.name), h('div', { class: 'small muted' }, p.text))));
    };
    drawPlans();

    // Pit: what broke last match, and what you want to do about it.
    const pit = [];
    if (last) {
      const flawIds = [...new Set(last.moments.filter((m) => m.flaw).map((m) => m.flaw))];
      const flaws = flawIds.map((id) => run.flaws.find((f) => f.id === id)).filter((f) => f && !f.fixed);
      flaws.forEach((f) => pit.push(h('div', { class: 'pitrow' }, h('div', { class: 'grow small' }, h('b', {}, f.name), h('div', { class: 'muted' }, f.found ? 'Now a known issue.' : 'You found this the hard way.')),
        h('button', { class: 'btn', onclick: () => { f.fixed = true; f.found = true; spend(fixCost(f)); sfx('drill'); unlock('match-strategy'); unlock('consistency'); prepMatch(kind, k, banner); } }, `Fix for good (${fixCost(f)} h)`))));
      if (ev.carry() > 0.05) pit.push(h('div', { class: 'pitrow' }, h('div', { class: 'grow small' }, h('b', { class: 'red' }, 'Damage will carry into this match'), h('div', { class: 'muted' }, 'The pit crew ran out of time last match.')),
        h('button', { class: 'btn', onclick: () => { ev.clearCarry(); spend(2); sfx('drill'); unlock('match-strategy'); prepMatch(kind, k, banner); } }, 'Full repair (2 h)')));
    }
    root.append(shell(title, 'Scout the opponent, decide your plan, and decide what to repair.',
      banner ? h('div', { class: 'panel hint' }, banner) : null,
      h('div', { class: 'row' },
        h('div', { class: 'col', style: 'width:420px' },
          h('div', { class: 'panel col' }, h('h3', {}, 'Scouting report'), h('div', {}, h('b', { class: 'gold' }, sc.name)), h('div', { class: 'small' }, sc.text), sc.detail ? h('div', { class: 'small gold' }, sc.detail) : h('div', { class: 'small muted' }, 'Team upgrade "Scouting team" adds expected scores.')),
          h('div', { class: 'panel col' }, h('h3', {}, 'Pit crew'),
            pit.length ? pit : h('div', { class: 'small muted' }, last ? 'Nothing needs repair.' : 'Fresh robot. Between matches you will choose what to fix for good and what to patch for now.'),
            last && pit.length ? h('div', { class: 'small muted' }, 'Fixes cost hours from the season clock (your driver practice shrinks). Leaving a problem unfixed means it can break again.') : null),
          kind === 'q' && k > 0 ? h('div', { class: 'panel col' }, h('b', {}, `Rank ${ev.rankAfter(k - 1)} after ${k} ${k === 1 ? 'match' : 'matches'}`), rankChart(ev.matches.slice(0, k).map((_, i) => ev.rankAfter(i)), 400, 110)) : null),
        h('div', { class: 'col grow' }, h('div', { class: 'panel col' }, h('h3', {}, 'Match plan'), planBox), startBtn))));
  }

  let lastPlayed = null;

  // ---- A single watched match ----
  function matchScreen(m, opts) {
    stop(); clear(root);
    lastPlayed = m;
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
        h('div', { class: 'small muted' }, `Plan: ${PLANS[m.plan].name}. Opponent: ${STYLES[m.style].name}.`),
        h('table', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'You'), h('th', {}, 'Partners / opponent')),
          row('Autonomous', m.auto, ''), row('Teleop', m.tele, ''), row('Endgame', m.end, ''),
          row('Total', m.ours, `${m.partners} / ${m.opp}`)),
        h('div', { class: 'small muted', style: 'margin-top:6px' }, `You completed ${m.cycles} of about ${m.potential} possible cycles.` + (m.loss > 0.05 ? ' Breakdowns cost you cycle time.' : ' No downtime.')),
        extra || null),
      h('div', { class: 'panel grow col' },
        h('h3', {}, m.moments.length ? 'What happened to your robot' : 'A clean match'),
        m.moments.length ? m.moments.map((mo) => h('div', { class: 'small' }, h('b', { class: 'red' }, mo.title + ': '), mo.text,
          mo.principle && PRINCIPLE_MAP[mo.principle] ? h('div', { class: 'gold' }, 'Lesson: ' + PRINCIPLE_MAP[mo.principle].title) : null))
          : h('div', { class: 'small muted' }, 'Nothing broke. Reliability is a design feature too.')));
  }

  // ---- Qualification ----
  function qualSideTop(k) {
    const played = ev.matches.slice(0, k);
    const wins = played.filter((m) => m.win).length, rpNow = played.reduce((a, m) => a + (m.win ? ev.season.rpWin || 2 : m.tie ? 1 : 0), 0);
    return h('div', { class: 'panel col' }, h('b', {}, `Record ${wins}-${played.length - wins} · ${rpNow} RP` + (k > 0 ? ` · rank ${ev.rankAfter(k - 1)}` : '')),
      k > 0 ? rankChart(played.map((_, i) => ev.rankAfter(i)), 400, 120) : h('div', { class: 'small muted' }, 'Rank history appears after your first match.'));
  }
  function playQual(k, planId) {
    const m = ev.playQual(k, planId);
    matchScreen(m, {
      title: `${evName}: ${m.stage}`, sub: 'Watch the match. You do not drive the robot, your design does.',
      sideTop: qualSideTop(k),
      nextLabel: k + 1 < MATCHES_PER_EVENT ? `Pit and plan: match ${k + 2} of ${MATCHES_PER_EVENT}` : 'Qualifications over: alliance selection',
      extra: h('div', { class: 'small gold', style: 'margin-top:6px' }, `Rank after ${k + 1} ${k === 0 ? 'match' : 'matches'}: ${ev.rankAfter(k)}`),
      next: () => (k + 1 < MATCHES_PER_EVENT ? prepMatch('q', k + 1) : selection()),
    });
  }

  // ---- Alliance selection ----
  function selection() {
    stop(); clear(root);
    const r = ev.finishQuals(), po = r.playoff;
    sfx(po.role === 'none' ? 'deny' : 'ding');
    const msg = po.role === 'captain' ? `You finished as the #${r.rank} seed, so you are an alliance captain. You pick the two best partners left, and you carry real playoff hopes.`
      : po.role === 'picked' ? `You finished rank ${r.rank}. A captain noticed your robot and picked you. You join as seed ${po.seed}.`
        : `You finished rank ${r.rank} and no captain picked you. Your event ends here. Robots that score and break less get picked.`;
    root.append(shell(`${evName}: alliance selection`, `Qualification complete: ${r.wins}-${MATCHES_PER_EVENT - r.wins}, ${r.rp} RP, average ${r.avg.toFixed(0)} points.`,
      h('div', { class: 'row' },
        h('div', { class: 'panel col' }, h('h3', {}, 'Qualification rank'), rankChart(r.rankPath, 520, 190), h('div', { class: 'small muted' }, 'Gold dashed line: the top eight become alliance captains.')),
        h('div', { class: 'panel col grow' }, h('h3', { class: po.role === 'none' ? 'red' : 'gold' }, po.role === 'none' ? 'Not selected' : po.role === 'captain' ? 'Alliance captain' : 'Picked for an alliance'), h('p', {}, msg),
          po.role === 'none' ? h('div', { class: 'small muted' }, 'Strength in qualifications is what gets you chosen: cycle speed, reliability, and a robot that works every match.') : h('div', { class: 'small muted' }, 'Playoffs are best of three, single elimination: quarterfinals, semifinals, finals. Keep scouting and repairing between matches.'),
          h('div', { style: 'flex:1' }),
          h('button', { class: 'btn primary', style: 'align-self:flex-start', onclick: () => (po.role === 'none' ? summary() : prepMatch('p', 0, 'Quarterfinals: best of three. The opposition is stronger than in qualifications.')) }, po.role === 'none' ? 'Event summary' : 'Start playoffs')))));
  }

  function bracketPanel() {
    const po = res().playoff;
    if (po.role === 'none') return null;
    return h('div', { class: 'panel' }, h('h3', {}, `Playoff bracket (you are seed ${po.seed})`),
      h('div', { class: 'grid3' }, ...['Quarterfinals', 'Semifinals', 'Finals'].map((name, i) => {
        const rd = po.rounds[i];
        if (!rd) return h('div', { class: 'card', style: 'cursor:default;opacity:.45' }, h('b', {}, name), h('div', { class: 'small muted' }, i > 0 && po.rounds[i - 1] && !po.rounds[i - 1].won ? 'Eliminated before this round' : 'Not reached'));
        return h('div', { class: 'card' + (rd.won ? ' sel' : ''), style: 'cursor:default' }, h('b', {}, name), h('div', { class: 'small' }, `vs seed ${rd.oppSeed}`),
          h('div', { class: 'small ' + (rd.won ? 'gold' : 'red') }, `${rd.won ? 'Won' : 'Lost'} ${rd.score}`));
      })));
  }

  // ---- Playoffs ----
  function playPlayoff(planId) {
    const out = ev.nextPlayoff(planId);
    const { match: m, rd, roundEnds, eventOver } = out;
    const po = res().playoff;
    const wins = rd.matches.filter((x) => x.win).length, losses = rd.matches.length - wins;
    const roundResult = roundEnds ? (rd.won ? `Round won ${rd.score}.` : `Round lost ${rd.score}. Your event ends here.`) : null;
    const nextRoundName = roundEnds && rd.won && !eventOver ? ['Semifinals', 'Finals'][po.rounds.length - 1] : null;
    matchScreen(m, {
      title: `${evName}: ${m.stage}`, sub: `Series: you ${wins}, them ${losses}`,
      sideTop: h('div', { class: 'panel col' }, h('b', {}, `${rd.name} vs seed ${rd.oppSeed}`), h('div', { class: 'small muted' }, 'Best of three. Your alliance picks matter; so does your robot.')),
      extra: roundResult ? h('div', { class: rd.won ? 'small gold' : 'small red', style: 'margin-top:6px' }, roundResult + (rd.won && eventOver ? ' You are the event winners!' : '')) : null,
      nextLabel: eventOver ? 'Event summary' : roundEnds ? `Pit and plan: ${nextRoundName}` : 'Pit and plan: next match',
      next: () => (eventOver ? summary() : prepMatch('p', 0, roundEnds ? `${nextRoundName}: you advanced, so the opposition gets tougher.` : null)),
    });
  }

  // ---- Summary ----
  function summary() {
    stop(); clear(root);
    const r = res(), po = r.playoff, score = eventScore(r);
    const incidents = [...r.matches, ...po.rounds.flatMap((x) => x.matches)].flatMap((m) => m.moments.filter((mo) => mo.principle).map((mo) => ({ title: mo.title, principle: mo.principle })));
    run.events.push({
      idx, rank: r.rank, wins: r.wins, rp: r.rp, avg: r.avg, score, rankPath: r.rankPath,
      playoff: { result: po.result, role: po.role, seed: po.seed, rounds: po.rounds.map((x) => ({ name: x.name, oppSeed: x.oppSeed, score: x.score, won: x.won })) },
      awards: r.awards.map((a) => a.name), incidents,
    });
    unlock('consistency');
    if (idx === 1) unlock('auton');
    if (r.dtFail > 0 || run.design.drivetrain.id !== 'swerve') unlock('drivetrain-king');
    save();
    sfx(po.result === 'Winner' ? 'cheer' : 'chime');
    if (po.result === 'Winner') setTimeout(() => sfx('win'), 300);
    const big = po.result === 'Winner' ? 'Event winners!' : po.result === 'Not selected' ? 'Qualifications only' : po.result;
    root.append(shell(`${evName}: complete`, null,
      h('div', { class: 'row' },
        h('div', { class: 'panel col grow' }, h('h3', {}, 'Result'),
          h('div', { style: 'font-size:30px', class: po.result === 'Winner' ? 'gold' : '' }, big),
          h('div', { class: 'small' }, `Qualifications: rank ${r.rank}, ${r.wins}-${MATCHES_PER_EVENT - r.wins}, average ${r.avg.toFixed(0)} points.`),
          po.role !== 'none' ? h('div', { class: 'small' }, `Alliance seed ${po.seed} (${po.role === 'captain' ? 'captain' : 'picked'}); playoffs: ` + po.rounds.map((x) => `${x.name} ${x.won ? 'won' : 'lost'} ${x.score}`).join(', ') + '.') : h('div', { class: 'small muted' }, 'No alliance picked you.'),
          rankChart(r.rankPath, 420, 140),
          h('div', { class: 'small gold' }, `Event score: +${score}  (play ${Math.round(r.avg * 0.5 + r.wins * 3 + Math.max(0, 25 - r.rank))}, playoffs ${po.bonus}, awards ${r.awards.length * 3})`)),
        h('div', { class: 'panel col grow' }, h('h3', {}, 'Awards'),
          r.awards.length ? r.awards.map((a) => h('div', {}, h('b', { class: 'gold' }, a.name), h('div', { class: 'small' }, a.why)))
            : h('div', { class: 'small muted' }, 'No awards this time. Awards go to robots that are reliable, well documented, well controlled, and built on shared knowledge. Tested, simple, organized designs earn them.'),
          h('div', { style: 'flex:1' }),
          h('button', { class: 'btn primary', style: 'align-self:flex-start', onclick: finish }, 'Continue the season'))),
      bracketPanel()));
  }

  function finish() { done(); }
  prep();
}
