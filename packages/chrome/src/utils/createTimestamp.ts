import { assert } from '@williamthorsen/toolbelt.guards';

type TimestampFormat = 'time' | 'datetime' | 'none';

export function createTimestamp(format: TimestampFormat = 'none'): string {
  const fullDatetime = new Date().toISOString().split('T').join(' ').replace('Z', '');
  const [datetime = undefined] = fullDatetime.split('.');
  const [_date = undefined, time = undefined] = fullDatetime.split(' ');

  assert(typeof datetime === 'string');
  assert(typeof time === 'string');

  switch (format) {
    case 'time':
      return time;
    case 'datetime':
      return datetime;
    default:
      return '';
  }
}
