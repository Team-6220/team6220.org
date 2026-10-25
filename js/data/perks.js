// Team upgrades: bought with points earned at the end of each season, equipped (up to 2) at the start of the next.
export const MAX_EQUIPPED = 2;
export const PERKS = [
  { id: 'machine-shop', name: 'Machine shop upgrade', cost: 30, text: 'Manufacturing takes about 12% fewer hours.' },
  { id: 'practice-field', name: 'Practice field', cost: 35, text: 'Adds 12 hours of driver practice value to every season.' },
  { id: 'open-alliance', name: 'Open Alliance subscription', cost: 35, text: 'Adopting a published design costs 1 hour instead of 2.' },
  { id: 'spare-parts', name: 'Spare parts cart', cost: 40, text: 'Your pit crew gets 1.5 extra hours of repair time at events.' },
  { id: 'scouting-team', name: 'Scouting team', cost: 40, text: 'Scouting reports show the opponent\'s expected score.' },
  { id: 'mentor-network', name: 'Mentor network', cost: 45, text: 'Every random encounter gains a third option: call a mentor to reveal a hidden flaw.' },
];
export const PERK_MAP = Object.fromEntries(PERKS.map((p) => [p.id, p]));
