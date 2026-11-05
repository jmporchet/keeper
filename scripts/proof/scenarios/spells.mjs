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
      throw new Error(`room tile ${String(tx)},${String(y)} is off screen`);
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

function heroById(heroes, id) {
  return heroes.find((hero) => hero.id === id);
}

function creatureById(creatures, id) {
  return creatures.find((creature) => creature.id === id);
}

export const name = "spells";

export async function run(ctx) {
  const { page } = ctx;
  for (let i = 0; i < 4; i += 1) {
    await page.click("#add-gold", { force: true });
  }
  await ctx.stepOnce();
  await ctx.panToTileCenter(31, 31);
  await paintRow(ctx, "#paint-lair", [30, 31, 32], 31);

  let setupTicks = 0;
  for (;;) {
    const creatures = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
    if (creatures.some((creature) => creature.state === "sleeping")) {
      break;
    }
    if (setupTicks >= 600) {
      throw new Error(`creature did not reach a bed after ${String(setupTicks)} ticks`);
    }
    await ctx.stepOnce(12, 10);
    setupTicks += 12;
  }

  let arrivalTicks = 0;
  for (;;) {
    const heroCount = await page.evaluate(() => globalThis.__keeper.heroCount);
    if (heroCount >= 1) {
      break;
    }
    if (arrivalTicks >= 1500) {
      throw new Error(`no hero arrived after ${String(arrivalTicks)} ticks`);
    }
    await ctx.stepOnce(4, 10);
    arrivalTicks += 4;
  }

  const layout = await page.evaluate(() => {
    const sections = Array.from(globalThis.document.querySelectorAll("#sandbox-panel .panel-section"));
    const find = (title) => sections.find((section) => section.querySelector(".panel-section-title")?.textContent === title);
    const commands = find("Commands");
    const spells = find("Spells");
    return {
      spellsVisible: spells !== undefined,
      lightning: spells !== undefined && spells.querySelector("#cast-lightning") !== null,
      heal: spells !== undefined && spells.querySelector("#cast-heal") !== null,
      speed: spells !== undefined && spells.querySelector("#cast-speed-imps") !== null,
      target: spells !== undefined && spells.querySelector("#spell-target") !== null,
      commandsClean:
        commands !== undefined &&
        commands.querySelector("#cast-lightning") === null &&
        commands.querySelector("#cast-heal") === null &&
        commands.querySelector("#cast-speed-imps") === null,
    };
  });
  if (!layout.spellsVisible || !layout.lightning || !layout.heal || !layout.speed || !layout.target) {
    throw new Error(`Spells section is incomplete: ${JSON.stringify(layout)}`);
  }
  if (!layout.commandsClean) {
    throw new Error(`Commands section still contains spell buttons: ${JSON.stringify(layout)}`);
  }

  const labels = await page.evaluate(() => ({
    lightningCost: globalThis.document.querySelector("#cast-lightning .spell-cost")?.textContent ?? "",
    lightningStatus: globalThis.document.querySelector("#cast-lightning .spell-status")?.textContent ?? "",
    healCost: globalThis.document.querySelector("#cast-heal .spell-cost")?.textContent ?? "",
    healStatus: globalThis.document.querySelector("#cast-heal .spell-status")?.textContent ?? "",
    speedCost: globalThis.document.querySelector("#cast-speed-imps .spell-cost")?.textContent ?? "",
    speedStatus: globalThis.document.querySelector("#cast-speed-imps .spell-status")?.textContent ?? "",
    lightningCostValue: globalThis.__keeper.lightningCost,
    healCostValue: globalThis.__keeper.healCost,
    speedCostValue: globalThis.__keeper.speedImpsCost,
  }));
  if (
    labels.lightningCost !== `${String(labels.lightningCostValue)}g` ||
    labels.healCost !== `${String(labels.healCostValue)}g` ||
    labels.speedCost !== `${String(labels.speedCostValue)}g`
  ) {
    throw new Error(`Spell costs are wrong: ${JSON.stringify(labels)}`);
  }
  if (labels.lightningStatus !== "ready" || labels.healStatus !== "ready" || labels.speedStatus !== "ready") {
    throw new Error(`Spell status is not ready: ${JSON.stringify(labels)}`);
  }
  await ctx.screenshot("proof/panel.png", "spells-panel");

  await page.evaluate(() => globalThis.__keeper.drainGold());
  await ctx.stepOnce(0, 50);
  const unaffordable = await page.evaluate(() => ({
    lightning: globalThis.document.querySelector("#cast-lightning").disabled,
    heal: globalThis.document.querySelector("#cast-heal").disabled,
    speed: globalThis.document.querySelector("#cast-speed-imps").disabled,
  }));
  if (!unaffordable.lightning || !unaffordable.heal || !unaffordable.speed) {
    throw new Error(`Unaffordable spells stayed enabled: ${JSON.stringify(unaffordable)}`);
  }
  for (let i = 0; i < 4; i += 1) {
    await page.click("#add-gold", { force: true });
  }
  await ctx.stepOnce(1, 50);
  const affordable = await page.evaluate(() => ({
    lightning: globalThis.document.querySelector("#cast-lightning").disabled,
    heal: globalThis.document.querySelector("#cast-heal").disabled,
    speed: globalThis.document.querySelector("#cast-speed-imps").disabled,
  }));
  if (affordable.lightning || affordable.heal || affordable.speed) {
    throw new Error(`Spells stayed disabled after restoring gold: ${JSON.stringify(affordable)}`);
  }

  ctx.clipStart();
  const heroesBefore = await page.evaluate(() => globalThis.__keeper.heroSnapshot());
  const heroTarget = heroesBefore[0];
  if (heroTarget === undefined) {
    throw new Error("spells proof started without a live hero");
  }
  await page.click("#cast-lightning", { force: true });
  const armed = await page.evaluate(() => ({
    arm: globalThis.__keeper.spellArm,
    targetValue: globalThis.__keeper.spellTargetValue,
    pressed: globalThis.document.querySelector("#cast-lightning").getAttribute("aria-pressed"),
    hidden: globalThis.document.querySelector("#spell-target").hidden,
    hint: globalThis.document.querySelector("#spell-target-hint").textContent,
    optionCount: globalThis.document.querySelectorAll("#spell-target option").length,
  }));
  if (armed.arm !== "lightning" || armed.pressed !== "true" || armed.hidden || armed.optionCount < 1) {
    throw new Error(`Lightning did not arm with targets: ${JSON.stringify(armed)}`);
  }
  if (armed.hint !== "Click a hero") {
    throw new Error(`Lightning target hint is wrong: ${JSON.stringify(armed)}`);
  }
  await page.selectOption("#spell-target", String(heroTarget.id));
  const selected = await page.evaluate(() => globalThis.__keeper.spellTargetValue);
  if (selected !== String(heroTarget.id)) {
    throw new Error(`Select did not keep hero ${String(heroTarget.id)}: ${selected}`);
  }

  const beforeLightning = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.lightningCooldown,
    cost: globalThis.__keeper.lightningCost,
    damage: globalThis.__keeper.lightningDamage,
    cooldownTicks: globalThis.__keeper.lightningCooldownTicks,
    heroes: globalThis.__keeper.heroSnapshot(),
  }));
  const heroBefore = heroById(beforeLightning.heroes, heroTarget.id);
  if (heroBefore === undefined) {
    throw new Error(`target hero ${String(heroTarget.id)} disappeared before the cast`);
  }
  await page.click("#cast-lightning", { force: true });
  await ctx.stepOnce(1, 250);
  const afterLightning = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.lightningCooldown,
    heroes: globalThis.__keeper.heroSnapshot(),
    arm: globalThis.__keeper.spellArm,
    drawCalls: globalThis.__keeper.drawCalls,
  }));
  const heroAfter = heroById(afterLightning.heroes, heroTarget.id);
  if (afterLightning.goldSpent !== beforeLightning.goldSpent + beforeLightning.cost) {
    throw new Error(
      `lightning did not spend ${String(beforeLightning.cost)} gold: ${String(beforeLightning.goldSpent)} -> ${String(afterLightning.goldSpent)}`,
    );
  }
  if (afterLightning.cooldown !== beforeLightning.cooldownTicks - 1) {
    throw new Error(
      `lightning cooldown was ${String(afterLightning.cooldown)}, expected ${String(beforeLightning.cooldownTicks - 1)}`,
    );
  }
  if (afterLightning.arm !== "none") {
    throw new Error(`lightning stayed armed after the cast: ${afterLightning.arm}`);
  }
  if (heroAfter === undefined) {
    if (heroBefore.hp > beforeLightning.damage) {
      throw new Error(`lightning killed hero ${String(heroTarget.id)} with ${String(heroBefore.hp)} hp`);
    }
  } else if (heroAfter.hp !== heroBefore.hp - beforeLightning.damage) {
    throw new Error(
      `lightning did not deal ${String(beforeLightning.damage)} damage: ${String(heroBefore.hp)} -> ${String(heroAfter.hp)}`,
    );
  }
  if (afterLightning.drawCalls > 7) {
    throw new Error(`draw calls ${String(afterLightning.drawCalls)} exceed 7`);
  }
  await ctx.panToTileCenter(heroTarget.tileX, heroTarget.tileY);
  await ctx.screenshot("proof/cast.png", "spells-cast");

  const creaturesBefore = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
  const creatureTarget = creaturesBefore[0];
  if (creatureTarget === undefined) {
    throw new Error("spells proof has no live creature to heal");
  }
  await page.evaluate(({ id }) => globalThis.__keeper.woundCreature(id, 2), { id: creatureTarget.id });
  const beforeHeal = await page.evaluate(() => ({
    goldSpent: globalThis.__keeper.goldSpent,
    cost: globalThis.__keeper.healCost,
    amount: globalThis.__keeper.healAmount,
    cooldownTicks: globalThis.__keeper.healCooldownTicks,
    creatures: globalThis.__keeper.creatureSnapshot(),
  }));
  const creatureBefore = creatureById(beforeHeal.creatures, creatureTarget.id);
  if (creatureBefore === undefined || creatureBefore.hp >= creatureBefore.maxHp) {
    throw new Error(`creature ${String(creatureTarget.id)} was not wounded`);
  }
  await page.click("#cast-heal", { force: true });
  const healArmed = await page.evaluate(() => ({
    arm: globalThis.__keeper.spellArm,
    pressed: globalThis.document.querySelector("#cast-heal").getAttribute("aria-pressed"),
    hidden: globalThis.document.querySelector("#spell-target").hidden,
    hint: globalThis.document.querySelector("#spell-target-hint").textContent,
    optionCount: globalThis.document.querySelectorAll("#spell-target option").length,
  }));
  if (healArmed.arm !== "heal" || healArmed.pressed !== "true" || healArmed.hidden || healArmed.optionCount < 1) {
    throw new Error(`Heal did not arm with targets: ${JSON.stringify(healArmed)}`);
  }
  if (healArmed.hint !== "Click a creature") {
    throw new Error(`Heal target hint is wrong: ${JSON.stringify(healArmed)}`);
  }
  await page.selectOption("#spell-target", String(creatureTarget.id));
  await page.click("#cast-heal", { force: true });
  await ctx.stepOnce(1, 250);
  const afterHeal = await page.evaluate(() => ({
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.healCooldown,
    creatures: globalThis.__keeper.creatureSnapshot(),
    drawCalls: globalThis.__keeper.drawCalls,
  }));
  const creatureAfter = creatureById(afterHeal.creatures, creatureTarget.id);
  if (afterHeal.goldSpent !== beforeHeal.goldSpent + beforeHeal.cost) {
    throw new Error(
      `heal did not spend ${String(beforeHeal.cost)} gold: ${String(beforeHeal.goldSpent)} -> ${String(afterHeal.goldSpent)}`,
    );
  }
  if (afterHeal.cooldown !== beforeHeal.cooldownTicks - 1) {
    throw new Error(
      `heal cooldown was ${String(afterHeal.cooldown)}, expected ${String(beforeHeal.cooldownTicks - 1)}`,
    );
  }
  if (creatureAfter === undefined) {
    throw new Error(`heal removed creature ${String(creatureTarget.id)}`);
  }
  const expectedHp = Math.min(creatureBefore.hp + beforeHeal.amount, creatureBefore.maxHp);
  if (creatureAfter.hp !== expectedHp) {
    throw new Error(
      `heal did not restore ${String(beforeHeal.amount)} hp capped at ${String(creatureBefore.maxHp)}: ${String(creatureBefore.hp)} -> ${String(creatureAfter.hp)}`,
    );
  }
  if (afterHeal.drawCalls > 7) {
    throw new Error(`draw calls ${String(afterHeal.drawCalls)} exceed 7`);
  }

  const beforeSpeed = await page.evaluate(() => ({
    goldSpent: globalThis.__keeper.goldSpent,
    cost: globalThis.__keeper.speedImpsCost,
    cooldownTicks: globalThis.__keeper.speedImpsCooldownTicks,
  }));
  await page.click("#cast-speed-imps", { force: true });
  await ctx.stepOnce(1, 250);
  const afterSpeed = await page.evaluate(() => ({
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.speedImpsCooldown,
    imps: globalThis.__keeper.impSnapshot(),
    arm: globalThis.__keeper.spellArm,
    drawCalls: globalThis.__keeper.drawCalls,
  }));
  if (afterSpeed.goldSpent !== beforeSpeed.goldSpent + beforeSpeed.cost) {
    throw new Error(
      `speed did not spend ${String(beforeSpeed.cost)} gold: ${String(beforeSpeed.goldSpent)} -> ${String(afterSpeed.goldSpent)}`,
    );
  }
  if (afterSpeed.cooldown !== beforeSpeed.cooldownTicks - 1) {
    throw new Error(
      `speed cooldown was ${String(afterSpeed.cooldown)}, expected ${String(beforeSpeed.cooldownTicks - 1)}`,
    );
  }
  if (afterSpeed.arm !== "none") {
    throw new Error(`speed left a targeting arm active: ${afterSpeed.arm}`);
  }
  if (afterSpeed.imps.filter((imp) => imp.boost > 0).length === 0) {
    throw new Error("speed did not boost any live imp");
  }
  if (afterSpeed.drawCalls > 7) {
    throw new Error(`draw calls ${String(afterSpeed.drawCalls)} exceed 7`);
  }

  const cooling = await page.evaluate(() => ({
    lightning: globalThis.document.querySelector("#cast-lightning").disabled,
    heal: globalThis.document.querySelector("#cast-heal").disabled,
    speed: globalThis.document.querySelector("#cast-speed-imps").disabled,
  }));
  if (!cooling.lightning || !cooling.heal || !cooling.speed) {
    throw new Error(`Cooling spells stayed enabled: ${JSON.stringify(cooling)}`);
  }
  const beforeDisabledClick = await page.evaluate(() => globalThis.__keeper.goldSpent);
  await page.click("#cast-lightning", { force: true });
  await ctx.stepOnce(1, 250);
  const afterDisabledClick = await page.evaluate(() => globalThis.__keeper.goldSpent);
  if (afterDisabledClick !== beforeDisabledClick) {
    throw new Error(`Cooling lightning spent gold: ${String(beforeDisabledClick)} -> ${String(afterDisabledClick)}`);
  }

  await ctx.stepOnce(1, 500);
  await ctx.stepOnce(1, 500);
  ctx.clipEnd();

  console.log(
    `spells setupTicks=${String(setupTicks)} arrivalTicks=${String(arrivalTicks)} hero=${String(heroTarget.id)} lightningGold=${String(afterLightning.goldSpent)} lightningCooldown=${String(afterLightning.cooldown)} creature=${String(creatureTarget.id)} healGold=${String(afterHeal.goldSpent)} healCooldown=${String(afterHeal.cooldown)} speedGold=${String(afterSpeed.goldSpent)} speedCooldown=${String(afterSpeed.cooldown)} boosted=${String(afterSpeed.imps.filter((imp) => imp.boost > 0).length)} cooling=${JSON.stringify(cooling)} drawCalls=${String(afterSpeed.drawCalls)}`,
  );
}
