const TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/x-m4b',
  'audio/aac',
  'audio/flac',
  'audio/ogg',
  'audio/opus',
  'audio/webm',
  'audio/wav',
];

/** The audio types this browser says it can play (canPlayType is '' for "no"). */
export function supportedMimeTypes(el: Pick<HTMLMediaElement, 'canPlayType'>): string[] {
  return TYPES.filter((t) => el.canPlayType(t) !== '');
}
