'use client';

export type FaceMood = 'idle' | 'listening' | 'thinking' | 'speaking' | 'staff' | 'error';

/** Vector face based on the supplied robot-screen reference; scales to the physical display. */
export function RobotFace({ mood, label }: { mood: FaceMood; label: string }) {
  return <svg className={`robot-face mood-${mood}`} viewBox="0 0 800 440" role="img" aria-label={label}>
    <defs>
      <radialGradient id="face-sheen" cx="25%" cy="12%" r="95%">
        <stop offset="0" stopColor="#ffffff" stopOpacity=".035" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="800" height="440" rx="100" fill="url(#face-sheen)" />
    <g className="robot-face-features" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="robot-brows" strokeWidth="16">
        <path d="M222 96 Q237 86 251 92" />
        <path d="M502 84 Q517 73 533 81" />
      </g>
      <g className="robot-eye-open" strokeWidth="25"><ellipse cx="236" cy="224" rx="78" ry="82" /></g>
      <g className="robot-eye-wink" strokeWidth="23"><path d="M584 157 Q524 181 475 222 Q529 220 588 234" /></g>
      <g className="robot-eye-awake" strokeWidth="25"><ellipse cx="536" cy="224" rx="78" ry="82" /></g>
      <g className="robot-cheeks" strokeWidth="7">
        <path d="M146 310 l-23 4 M148 330 l-22 7 M640 283 l24 -3 M640 305 l25 3" />
      </g>
      <path className="robot-nose" strokeWidth="11" d="M389 266 Q398 272 407 264" />
      <path className="robot-mouth" strokeWidth="10" d="M364 290 Q368 313 388 305 Q396 302 398 292 Q402 315 421 304 Q430 300 432 287" />
      <ellipse className="robot-speaking-mouth" cx="399" cy="301" rx="28" ry="22" strokeWidth="10" />
    </g>
    <path className="robot-sparkle" fill="currentColor" d="M633 173 l4 10 11 2 -10 6 -1 11 -7 -9 -11 1 7 -9 -3 -10Z" />
    <g className="robot-thinking-dots" fill="currentColor"><circle cx="367" cy="380" r="5" /><circle cx="400" cy="380" r="5" /><circle cx="433" cy="380" r="5" /></g>
  </svg>;
}
