import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WavyProgress } from './WavyProgress';

const css = readFileSync(resolve(__dirname, './WavyProgress.module.css'), 'utf-8');
const rule = (name: string) => (css.match(new RegExp(String.raw`(^|\n)\.${name}\s*\{[^}]*\}`)) ?? [''])[0];

describe('WavyProgress', () => {
  it('is a named progressbar with a rounded percentage, clamped to 0..100, and announces the times', () => {
    const { rerender } = render(<WavyProgress position={28400} duration={100000} />);
    const bar = screen.getByRole('progressbar', { name: 'Progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '28');
    expect(bar).toHaveAttribute('aria-valuetext', '0:28 of 1:40');
    rerender(<WavyProgress position={140000} duration={100000} />);
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar.style.getPropertyValue('--wavy-p')).toBe('1');
    rerender(<WavyProgress position={-5} duration={100000} />);
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows an empty track when the duration is unknown', () => {
    render(<WavyProgress position={5000} duration={0} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).not.toHaveAttribute('aria-valuetext');
  });

  it('marks itself paused, and keeps the wave out of the accessibility tree', () => {
    const { container } = render(<WavyProgress position={50} duration={100} paused />);
    expect(screen.getByRole('progressbar').className).toMatch(/paused/);
    container.querySelectorAll('svg').forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'));
  });

  it('ramps the wave up across the first wavelength: ten strips of rising height, then the full wave', () => {
    const { container } = render(<WavyProgress position={50} duration={100} />);
    const envs = [...container.querySelectorAll<HTMLElement>('[style*="--strip-x"]')].map((el) =>
      el.style.getPropertyValue('--env')
    );
    expect(envs).toHaveLength(11);
    const ramp = envs.slice(0, 10).map(Number);
    expect(ramp[0]).toBeLessThan(0.01);
    ramp.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(ramp[i]));
    expect(envs[10]).toBe(''); // the full-height rest uses the default, 1
  });

  it('moves with clips and transforms only, never width or layout properties', () => {
    for (const name of ['rest', 'played', 'travel', 'path']) {
      expect(rule(name), `Expected a .${name} rule`).not.toBe('');
      expect(rule(name), `.${name} must not transition layout`).not.toMatch(/transition:[^;]*(width|left|right)/);
    }
    expect(rule('played')).toMatch(/clip-path:\s*inset/);
    expect(css).toMatch(/@keyframes wavyTravel\s*\{\s*to\s*\{\s*transform:\s*translateX/);
  });

  it('stops all motion under prefers-reduced-motion', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.travel\s*\{\s*animation:\s*none/);
    expect(reduced).toMatch(/transition:\s*none/);
  });
});
