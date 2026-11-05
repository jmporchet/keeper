export function walkGridLine(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  visit: (x: number, y: number) => void,
): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const majorStart = horizontal ? fromX : fromY;
  const majorEnd = horizontal ? toX : toY;
  const minorStart = horizontal ? fromY : fromX;
  const minorEnd = horizontal ? toY : toX;
  const majorDelta = Math.abs(majorEnd - majorStart);
  const minorDelta = Math.abs(minorEnd - minorStart);
  const majorStep = majorEnd >= majorStart ? 1 : -1;
  const minorStep = minorEnd >= minorStart ? 1 : -1;
  let major = majorStart;
  let minor = minorStart;
  let error = 2 * minorDelta - majorDelta;
  if (horizontal) {
    visit(major, minor);
  } else {
    visit(minor, major);
  }
  while (major !== majorEnd) {
    major += majorStep;
    if (error > 0) {
      minor += minorStep;
      if (horizontal) {
        visit(major, minor - minorStep);
        visit(major, minor);
      } else {
        visit(minor - minorStep, major);
        visit(minor, major);
      }
      error -= 2 * majorDelta;
    } else if (horizontal) {
      visit(major, minor);
    } else {
      visit(minor, major);
    }
    error += 2 * minorDelta;
  }
}
