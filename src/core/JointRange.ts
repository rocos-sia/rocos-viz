import type { JointDisplayRange } from './types';

export function readJointRanges(xml: string): Record<string, JointDisplayRange> {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror') || document.documentElement.tagName !== 'robot') return {};
  const ranges: Record<string, JointDisplayRange> = {};
  for (const joint of Array.from(document.documentElement.children).filter((node) => node.tagName === 'joint')) {
    const name = joint.getAttribute('name');
    const type = joint.getAttribute('type');
    if (!name || !['revolute', 'continuous', 'prismatic'].includes(type ?? '')) continue;
    const unit = type === 'prismatic' ? 'mm' : '°';
    const scale = unit === 'mm' ? 1000 : 180 / Math.PI;
    const limit = joint.querySelector('limit');
    const lower = limit?.getAttribute('lower'), upper = limit?.getAttribute('upper');
    const min = lower?.trim() ? Number(lower) * scale : NaN;
    const max = upper?.trim() ? Number(upper) * scale : NaN;
    ranges[name] = type !== 'continuous' && Number.isFinite(min) && Number.isFinite(max) && min < max
      ? { min, max, unit } : { unit };
  }
  return ranges;
}

/** Display-only scale: never constrains or changes a robot command. */
export function jointBarRange(value: number, range?: JointDisplayRange) {
  const limited = range?.min !== undefined && range.max !== undefined;
  const reference = range?.unit === 'mm' ? 1000 : 180;
  const extent = Math.max(reference, Math.ceil(Math.abs(value) / reference) * reference);
  const lower = limited ? range.min! : -extent;
  const upper = limited ? range.max! : extent;
  // Keep zero visible even for joints whose allowed range is entirely on one side.
  const min = Math.min(0, lower), max = Math.max(0, upper);
  const position = (x: number) => (Math.min(max, Math.max(min, x)) - min) / (max - min) * 100;
  const zero = position(0), current = position(value);
  return { zero, left: Math.min(zero, current), width: Math.abs(current - zero), lower, upper, limited };
}
