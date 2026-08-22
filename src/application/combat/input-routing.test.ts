import { describe, expect, it } from 'vitest';
import {
  KEY_BINDING_TABLE,
  routeKeyInput,
  shouldForwardPointerMove,
} from './input-routing';
import type { CombatInputContext } from './input-routing';

const ENABLED: CombatInputContext = {
  inputEnabled: true,
  nativeInputFocused: false,
};

describe('KEY_BINDING_TABLE (Combat §5.3, Technical Foundation §7)', () => {
  it('contains exactly the approved bindings and nothing else', () => {
    expect(KEY_BINDING_TABLE).toEqual({
      KeyW: 'move-up',
      ArrowUp: 'move-up',
      KeyS: 'move-down',
      ArrowDown: 'move-down',
      KeyA: 'move-left',
      ArrowLeft: 'move-left',
      KeyD: 'move-right',
      ArrowRight: 'move-right',
      KeyF: 'toggle-mode',
    });
  });
});

describe('routeKeyInput', () => {
  it('routes every approved movement binding on keydown and keyup', () => {
    const cases: ReadonlyArray<
      readonly [string, 'up' | 'down' | 'left' | 'right']
    > = [
      ['KeyW', 'up'],
      ['ArrowUp', 'up'],
      ['KeyS', 'down'],
      ['ArrowDown', 'down'],
      ['KeyA', 'left'],
      ['ArrowLeft', 'left'],
      ['KeyD', 'right'],
      ['ArrowRight', 'right'],
    ];
    for (const [code, key] of cases) {
      expect(routeKeyInput(code, true, false, ENABLED)).toEqual({
        kind: 'movement',
        key,
        pressed: true,
      });
      expect(routeKeyInput(code, false, false, ENABLED)).toEqual({
        kind: 'movement',
        key,
        pressed: false,
      });
    }
  });

  it('routes F only on a fresh keydown (single toggle per press)', () => {
    expect(routeKeyInput('KeyF', true, false, ENABLED)).toEqual({
      kind: 'toggle-mode',
    });
    expect(routeKeyInput('KeyF', false, false, ENABLED)).toEqual({
      kind: 'none',
    });
  });

  it('suppresses auto-repeat for both movement and toggle', () => {
    expect(routeKeyInput('KeyW', true, true, ENABLED)).toEqual({
      kind: 'none',
    });
    expect(routeKeyInput('KeyF', true, true, ENABLED)).toEqual({
      kind: 'none',
    });
  });

  it('rejects unapproved bindings', () => {
    for (const code of [
      'KeyG',
      'Space',
      'Enter',
      'Tab',
      'ShiftLeft',
      'Digit1',
    ]) {
      expect(routeKeyInput(code, true, false, ENABLED)).toEqual({
        kind: 'none',
      });
    }
  });

  it('rejects all routing while input is disabled (S13 blocked state)', () => {
    const blocked: CombatInputContext = {
      inputEnabled: false,
      nativeInputFocused: false,
    };
    expect(routeKeyInput('KeyW', true, false, blocked)).toEqual({
      kind: 'none',
    });
    expect(routeKeyInput('KeyF', true, false, blocked)).toEqual({
      kind: 'none',
    });
    expect(routeKeyInput('KeyD', false, false, blocked)).toEqual({
      kind: 'none',
    });
  });

  it('rejects all routing while a native UI control is focused', () => {
    const focused: CombatInputContext = {
      inputEnabled: true,
      nativeInputFocused: true,
    };
    expect(routeKeyInput('KeyW', true, false, focused)).toEqual({
      kind: 'none',
    });
    expect(routeKeyInput('KeyF', true, false, focused)).toEqual({
      kind: 'none',
    });
  });
});

describe('shouldForwardPointerMove (AC-071)', () => {
  it('forwards only enabled, inside-viewport positions', () => {
    expect(shouldForwardPointerMove(640, 300, 1280, 600, ENABLED)).toBe(true);
    expect(shouldForwardPointerMove(2000, 400, 1280, 600, ENABLED)).toBe(false);
    expect(shouldForwardPointerMove(-5, 300, 1280, 600, ENABLED)).toBe(false);
    expect(
      shouldForwardPointerMove(640, 300, 1280, 600, {
        inputEnabled: false,
        nativeInputFocused: false,
      }),
    ).toBe(false);
  });
});
