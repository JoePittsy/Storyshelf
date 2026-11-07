import { useEffect } from 'react';
import { AirPlayButton } from '@joepittsy/ui';
import { airPlayPossible, showAirPlayPicker, useAirPlay } from './airplay';
import { prepareAudio } from './engine';

/**
 * The AirPlay button, for as long as Safari reports a target: lit while playback is on one, and opening the system
 * picker. Anywhere without the API it renders nothing. In Safari it has the player make its <audio> straight away, so
 * the targets are known before the first Play.
 */
export function AirPlayControl({ className }: { className?: string }) {
  useEffect(() => {
    if (airPlayPossible()) prepareAudio();
  }, []);
  const { available, wireless } = useAirPlay();
  if (!available) return null;
  return <AirPlayButton active={wireless} onClick={() => void showAirPlayPicker()} className={className} />;
}
