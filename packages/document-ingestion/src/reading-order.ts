import type { SourceBlock } from "@lingua-bloom/contracts";

const POSITION_EPSILON = 0.5;

export function orderBlocksByColumns(
  blocks: readonly SourceBlock[],
  pageWidth: number
): SourceBlock[] {
  const divider = pageWidth / 2;
  const comparable = [...blocks];
  comparable.sort((left, right) => {
    const leftBox = left.bbox;
    const rightBox = right.bbox;
    if (!leftBox || !rightBox) return left.order - right.order;

    const leftColumn = leftBox.x < divider ? 0 : 1;
    const rightColumn = rightBox.x < divider ? 0 : 1;
    if (leftColumn !== rightColumn) return leftColumn - rightColumn;
    if (Math.abs(leftBox.y - rightBox.y) > POSITION_EPSILON) return leftBox.y - rightBox.y;
    return leftBox.x - rightBox.x;
  });
  return comparable;
}
