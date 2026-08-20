import { createAabb } from '@domain/geometry';
import type { Aabb } from '@domain/geometry';

export const OVERLAP_A: Aabb = createAabb(0, 0, 10, 10);
export const OVERLAP_B: Aabb = createAabb(5, 5, 10, 10);

export const EDGE_TOUCH_RIGHT_A: Aabb = createAabb(0, 0, 10, 10);
export const EDGE_TOUCH_RIGHT_B: Aabb = createAabb(10, 0, 10, 10);

export const CORNER_TOUCH_A: Aabb = createAabb(0, 0, 10, 10);
export const CORNER_TOUCH_B: Aabb = createAabb(10, 10, 5, 5);

export const SEPARATED_A: Aabb = createAabb(0, 0, 10, 10);
export const SEPARATED_B: Aabb = createAabb(20, 20, 5, 5);
