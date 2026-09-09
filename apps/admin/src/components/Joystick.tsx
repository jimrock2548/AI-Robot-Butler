'use client';

import { useEffect, useRef, useState } from 'react';

interface Pressed {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

const NONE: Pressed = { up: false, down: false, left: false, right: false };

/**
 * Joystick 8 ทิศ — ควบคุมด้วยเมาส์/สัมผัส (กดค้าง) และคีย์บอร์ด (ลูกศร / WASD)
 * ส่ง (vx, vyaw): vx =เดินหน้า/ถอย -1..1, vyaw = หมุนซ้าย/ขวา -1..1 (ซ้าย = บวก)
 */
export function Joystick({
  onMove,
  disabled = false,
}: {
  onMove: (vx: number, vyaw: number) => void;
  disabled?: boolean;
}) {
  const [pressed, setPressed] = useState<Pressed>(NONE);
  const [focused, setFocused] = useState(false);
  const pressedRef = useRef(pressed);
  pressedRef.current = pressed;

  const emit = (p: Pressed) => {
    const vx = p.up ? 1 : p.down ? -1 : 0;
    const vyaw = p.left ? 1 : p.right ? -1 : 0;
    onMove(vx, vyaw);
  };

  const setKey = (key: keyof Pressed, value: boolean) => {
    setPressed((prev) => {
      if (prev[key] === value) return prev;
      const next = { ...prev, [key]: value };
      emit(next);
      return next;
    });
  };

  // คีย์บอร์ด — ปล่อยทุกปุ่มเมื่อหลุด focus (ความปลอดภัย: หุ่นต้องหยุด)
  useEffect(() => {
    if (!focused) return;
    const down = (e: KeyboardEvent) => {
      const k = keyToDir(e.key);
      if (!k) return;
      e.preventDefault();
      setKey(k, true);
    };
    const up = (e: KeyboardEvent) => {
      const k = keyToDir(e.key);
      if (!k) return;
      e.preventDefault();
      setKey(k, false);
    };
    const blur = () => {
      setPressed(NONE);
      emit(NONE);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      blur();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const btnCls = (key: keyof Pressed) =>
    `btn border-line-2 ${
      pressed[key]
        ? 'bg-navy text-white border-navy'
        : 'bg-surface text-ink hover:bg-surface-3'
    } ${focused ? 'ring-2 ring-navy/40' : ''}`;

  return (
    <div
      tabIndex={0}
      role="group"
      aria-label="Joystick ควบคุมหุ่น — กดค้างเพื่อบังคับทิศทาง ปล่อยเพื่อหยุด"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`select-none outline-none rounded-[3px] ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
    >
      <div className="grid grid-cols-3 gap-1.5 w-52 mx-auto">
        <span />
        <button type="button" disabled={disabled} className={btnCls('up')} onPointerDown={() => setKey('up', true)} onPointerUp={() => setKey('up', false)} onPointerLeave={() => setKey('up', false)} onPointerCancel={() => setKey('up', false)}>
          ▲ หน้า
        </button>
        <span />
        <button type="button" disabled={disabled} className={btnCls('left')} onPointerDown={() => setKey('left', true)} onPointerUp={() => setKey('left', false)} onPointerLeave={() => setKey('left', false)} onPointerCancel={() => setKey('left', false)}>
          ◀ ซ้าย
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setPressed(NONE);
            emit(NONE);
          }}
          className="btn bg-red-bg text-red border-transparent hover:bg-red hover:text-white"
        >
          หยุด
        </button>
        <button type="button" disabled={disabled} className={btnCls('right')} onPointerDown={() => setKey('right', true)} onPointerUp={() => setKey('right', false)} onPointerLeave={() => setKey('right', false)} onPointerCancel={() => setKey('right', false)}>
          ▶ ขวา
        </button>
        <span />
        <button type="button" disabled={disabled} className={btnCls('down')} onPointerDown={() => setKey('down', true)} onPointerUp={() => setKey('down', false)} onPointerLeave={() => setKey('down', false)} onPointerCancel={() => setKey('down', false)}>
          ▼ ถอย
        </button>
        <span />
      </div>
      <p className="text-xs text-ink-3 mt-2 text-center leading-body">
        กดค้างเพื่อเคลื่อนที่ · ปล่อยเพื่อหยุด · คีย์บอร์ด: ลูกศร / W A S D (ต้องกดในกรอบนี้)
      </p>
    </div>
  );
}

function keyToDir(key: string): keyof Pressed | null {
  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return 'up';
    case 'ArrowDown':
    case 's':
    case 'S':
      return 'down';
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return 'left';
    case 'ArrowRight':
    case 'd':
    case 'D':
      return 'right';
    default:
      return null;
  }
}
