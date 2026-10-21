import { config } from '../config';
export const speedBounds = { minLinearMps: 0.05, maxLinearMps: 0.5, minAngularRps: 0.1, maxAngularRps: 1 };
let limits = { linearMps: config.robot.maxLinearMps as number, angularRps: config.robot.maxAngularRps as number };
export function getMotionSettings() { return { ...limits }; }
export function updateMotionSettings(value: typeof limits) { limits = { ...value }; }
