/**
 * Pure axis-aligned bounding-box (AABB) primitives.
 *
 * Dimensions invariant: `width` and `height` are finite and strictly greater
 * than `0` (zero-area boxes are not allowed; `createAabb` rejects violations).
 *
 * Edge-contact semantics (approved by the Product Owner and grounded in the
 * Combat spawn rule "the hitbox edge touches the boundary => fully outside",
 * Combat §7.4 / Master §7.8): boxes that share only an edge (zero-area
 * contact) do NOT overlap.
 */
export interface Aabb {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function createAabb(
  x: number,
  y: number,
  width: number,
  height: number,
): Aabb {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError(`Aabb position must be finite: x=${x}, y=${y}`);
  }
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError(
      `Aabb size must be finite and strictly positive: width=${width}, height=${height}`,
    );
  }
  return { x, y, width, height };
}

/** Strict overlap: touching edges do NOT overlap. */
export function overlaps(a: Aabb, b: Aabb): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function isSeparated(a: Aabb, b: Aabb): boolean {
  return !overlaps(a, b);
}
