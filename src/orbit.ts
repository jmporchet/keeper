export const ORBIT_RADIUS = 56;
export const ORBIT_HEIGHT = 42;
export const TICKS_PER_TURN = 360;
export const ANGLE_PER_TICK = (Math.PI * 2) / TICKS_PER_TURN;

export function orbitPosition(tick: number): { x: number; y: number; z: number } {
  const angle = tick * ANGLE_PER_TICK;
  return {
    x: Math.cos(angle) * ORBIT_RADIUS,
    y: ORBIT_HEIGHT,
    z: Math.sin(angle) * ORBIT_RADIUS,
  };
}
