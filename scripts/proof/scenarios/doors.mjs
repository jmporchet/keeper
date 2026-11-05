export const name = "doors";

const DOOR_COST = 50;
const TRAP_COST = 40;
const LAIR_COST = 30;
const HERO_HP = 4;
const TRAP_DAMAGE = 2;
const DOOR_WALL = [30, 31, 32, 33, 34];

async function paintRow(ctx, tool, xs, y) {
  const { page } = ctx;
  await page.click(tool, { force: true });
  const paintingOn = await page.evaluate(() => globalThis.__keeper.painting);
  if (!paintingOn) {
    throw new Error(`${tool} did not select Painting`);
  }
  const points = [];
  for (const tx of xs) {
    const point = await ctx.pagePointForTile(tx, y);
    if (point === null) {
      throw new Error(`paint tile ${String(tx)},${String(y)} is off screen`);
    }
    points.push(point);
  }
  const first = points[0];
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    await page.mouse.move(point.x, point.y);
  }
  await page.mouse.up();
  await ctx.stepOnce();
  await page.click(tool, { force: true });
  const paintingOff = await page.evaluate(() => globalThis.__keeper.painting);
  if (paintingOff) {
    throw new Error(`${tool} stayed selected after toggle`);
  }
}

async function waitForCreatureSleeping(ctx) {
  for (let ticks = 0; ticks < 600; ticks += 12) {
    const creatures = await ctx.page.evaluate(() => globalThis.__keeper.creatureSnapshot());
    if (creatures.some((creature) => creature.state === "sleeping")) {
      return;
    }
    await ctx.stepOnce(12, 10);
  }
  throw new Error("creature did not reach a bed");
}

async function waitForHero(ctx) {
  for (let ticks = 0; ticks < 1500; ticks += 12) {
    const heroCount = await ctx.page.evaluate(() => globalThis.__keeper.heroCount);
    if (heroCount >= 1) {
      return;
    }
    await ctx.stepOnce(12, 10);
  }
  throw new Error("no hero arrived");
}

async function waitForTrap(ctx) {
  for (let ticks = 0; ticks < 200; ticks += 1) {
    const result = await ctx.page.evaluate(() => ({
      trapCount: globalThis.__keeper.trapCount,
      heroes: globalThis.__keeper.heroSnapshot(),
    }));
    if (result.trapCount === 0 && result.heroes.some((hero) => hero.hp < HERO_HP)) {
      return result;
    }
    await ctx.stepOnce(1, 25);
  }
  throw new Error("gas trap was not spent by a hero");
}

export async function run(ctx) {
  const { page } = ctx;
  for (let i = 0; i < 4; i += 1) {
    await page.click("#add-gold", { force: true });
    await ctx.stepOnce();
  }
  await ctx.panToTileCenter(31, 32);
  await paintRow(ctx, "#paint-lair", [30, 31, 32], 31);
  await paintRow(ctx, "#paint-door", DOOR_WALL, 33);
  await paintRow(ctx, "#paint-trap", [32], 34);

  const painted = await page.evaluate(() => ({
    doors: globalThis.__keeper.doorCount,
    traps: globalThis.__keeper.trapCount,
    spent: globalThis.__keeper.goldSpent,
  }));
  const expectedSpent = 3 * LAIR_COST + DOOR_WALL.length * DOOR_COST + TRAP_COST;
  if (painted.doors !== DOOR_WALL.length) {
    throw new Error(`expected ${String(DOOR_WALL.length)} doors, got ${String(painted.doors)}`);
  }
  if (painted.traps !== 1) {
    throw new Error(`expected 1 live trap, got ${String(painted.traps)}`);
  }
  if (painted.spent !== expectedSpent) {
    throw new Error(`expected ${String(expectedSpent)} gold spent, got ${String(painted.spent)}`);
  }
  await ctx.checkpoint("doors-paint");

  await waitForCreatureSleeping(ctx);
  await waitForHero(ctx);

  ctx.clipStart();
  const initial = await page.evaluate(() => ({
    heartHp: globalThis.__keeper.heartHp,
    heartMaxHp: globalThis.__keeper.heartMaxHp,
    doorCount: globalThis.__keeper.doorCount,
    trapCount: globalThis.__keeper.trapCount,
    heroCount: globalThis.__keeper.heroCount,
  }));
  if (initial.heroCount < 1) {
    throw new Error("door proof started without a live hero");
  }
  if (initial.doorCount !== DOOR_WALL.length) {
    throw new Error(`door wall was not intact at proof start: ${String(initial.doorCount)}`);
  }
  if (initial.heartHp !== initial.heartMaxHp) {
    throw new Error("heart was already damaged before the door wall broke");
  }

  const trapped = await waitForTrap(ctx);
  if (trapped.trapCount !== 0) {
    throw new Error(`trap ended live at ${String(trapped.trapCount)}`);
  }
  const damagedHero = trapped.heroes.find((hero) => hero.hp < HERO_HP);
  if (damagedHero === undefined) {
    throw new Error("no hero took gas trap damage");
  }
  if (damagedHero.hp !== HERO_HP - TRAP_DAMAGE) {
    throw new Error(`trap damage was ${String(HERO_HP - damagedHero.hp)}, expected ${String(TRAP_DAMAGE)}`);
  }
  const afterTrap = await page.evaluate(() => ({
    heartHp: globalThis.__keeper.heartHp,
    doorCount: globalThis.__keeper.doorCount,
  }));
  if (afterTrap.heartHp !== initial.heartHp) {
    throw new Error("heart took damage before a door broke");
  }
  await ctx.checkpoint("doors-trap");

  let breakTicks = 0;
  let broken = await page.evaluate(() => globalThis.__keeper.doorCount);
  while (broken === DOOR_WALL.length) {
    if (breakTicks >= 200) {
      throw new Error(`no door broke after ${String(breakTicks)} ticks`);
    }
    await ctx.stepOnce(1, 25);
    breakTicks += 1;
    broken = await page.evaluate(() => globalThis.__keeper.doorCount);
  }
  await ctx.checkpoint("doors-broken");

  let heartTicks = 0;
  let heartHp = await page.evaluate(() => globalThis.__keeper.heartHp);
  while (heartHp === initial.heartHp) {
    if (heartTicks >= 200) {
      const debug = await page.evaluate(() => ({
        heroes: globalThis.__keeper.heroSnapshot(),
        doors: globalThis.__keeper.doorSnapshot(),
        creatures: globalThis.__keeper.creatureSnapshot(),
        trapCount: globalThis.__keeper.trapCount,
        heartHp: globalThis.__keeper.heartHp,
      }));
      throw new Error(
        `heart did not take damage after the door broke in ${String(heartTicks)} ticks: ${JSON.stringify(debug)}`,
      );
    }
    await ctx.stepOnce(1, 25);
    heartTicks += 1;
    heartHp = await page.evaluate(() => globalThis.__keeper.heartHp);
  }

  await ctx.panToTileCenter(32, 32);
  await ctx.stepOnce(1, 150);
  await ctx.screenshot("proof/doors.png", "doors");
  await ctx.checkpoint("doors-heart");
  await ctx.panToTileCenter(32, 34);
  await ctx.stepOnce(1, 150);
  ctx.clipEnd();

  const result = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    doorCount: globalThis.__keeper.doorCount,
    trapCount: globalThis.__keeper.trapCount,
    heartHp: globalThis.__keeper.heartHp,
    drawCalls: globalThis.__keeper.drawCalls,
    heroes: globalThis.__keeper.heroSnapshot(),
  }));
  if (result.drawCalls > 7) {
    throw new Error(`draw calls ${String(result.drawCalls)} exceed 7`);
  }
  console.log(
    `doors doors=${String(initial.doorCount)} broken=${String(broken)} breakTicks=${String(breakTicks)} trapHeroHp=${String(damagedHero.hp)} heartHp=${String(result.heartHp)} heartTicks=${String(heartTicks)} drawCalls=${String(result.drawCalls)}`,
  );
}
