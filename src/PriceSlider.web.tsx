import React from 'react';
type Props = { accessibilityLabel: string; minimumValue: number; maximumValue: number; step: number; value: number; onValueChange: (value: number) => void; minimumTrackTintColor: string; maximumTrackTintColor: string; thumbTintColor: string };
export default function PriceSlider(props: Props) {
  return <input type="range" aria-label={props.accessibilityLabel} min={props.minimumValue} max={props.maximumValue} step={props.step} value={props.value} onChange={event => props.onValueChange(Number(event.target.value))} style={{ width: '100%', margin: '8px 0', accentColor: props.minimumTrackTintColor, cursor: 'pointer' }}/>;
}
