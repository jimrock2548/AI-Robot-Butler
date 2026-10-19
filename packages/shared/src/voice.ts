/** Browser-independent wake gate; capture never dispatches a robot command. */
export function extractWakeCommand(text: string, phrase: string): string | null {
  const normalized = text.normalize('NFC').toLowerCase().trim();
  const wake = phrase.normalize('NFC').toLowerCase().trim();
  if (!wake) return null;
  const pattern = wake.split(/\s+/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  const match = new RegExp(`^${pattern}(?:[\\s,!.:]+|(?=[ก-๙])|$)`, 'iu').exec(normalized);
  return match ? text.trim().slice(match[0].length).trim() : null;
}
export class WakeGate {
  private armedUntil = 0;
  constructor(private readonly phrase: string, private readonly windowMs = 8000) {}
  accept(text: string, now = Date.now()): { command: string | null; armed: boolean } {
    const command = extractWakeCommand(text, this.phrase);
    if (command !== null) {
      this.armedUntil = now + this.windowMs;
      if (!command) return { command: null, armed: true };
    } else if (now > this.armedUntil || this.armedUntil === 0) return { command: null, armed: false };
    this.armedUntil = 0;
    return { command: command ?? text.trim(), armed: false };
  }
}
