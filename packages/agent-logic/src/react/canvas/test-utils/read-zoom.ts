/** Reads the zoom from the transform of the canvas's viewport. */
export function readZoom(container: HTMLElement): number {
  const transform = container.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '';
  const scale = /scale\(([\d.]+)\)/.exec(transform)?.[1];
  if (scale === undefined) throw new Error(`the viewport has no scale: ${transform}`);
  return Number(scale);
}
