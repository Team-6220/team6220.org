import type { GameModule } from "@goldsim/core";

/**
 * Game modules carry TypeScript hooks, which cannot be sent to a Web Worker. Jobs therefore name a module by id
 * and each thread resolves it here. Register every season's module once (Stay Gold: one line per new game).
 */
const games = new Map<string, GameModule>();

export function registerGame(module: GameModule, id = module.game.id): void {
  games.set(id, module);
}

export function getGame(id: string): GameModule {
  const g = games.get(id);
  if (!g) throw new Error(`Game module "${id}" is not registered in this thread. Call registerGame() first.`);
  return g;
}

export function registeredGames(): string[] {
  return [...games.keys()];
}

export function resolveGame(game: string | GameModule): GameModule {
  return typeof game === "string" ? getGame(game) : game;
}
