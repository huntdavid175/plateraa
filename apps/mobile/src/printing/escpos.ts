/**
 * Builds ESC/POS bytes for 58mm receipt printers (32 characters a line). Text is sent as plain
 * ASCII, the one encoding every cheap printer agrees on, so the cedi sign is written "GHS".
 */

export const LINE_WIDTH = 32;

const ESC = 0x1b;
const GS = 0x1d;

export class Receipt {
  private readonly bytes: number[] = [ESC, 0x40]; // initialise

  text(line = ''): this {
    for (const char of line) {
      const code = char.charCodeAt(0);
      this.bytes.push(code >= 0x20 && code < 0x7f ? code : 0x3f); // '?' for anything non-ASCII
    }
    this.bytes.push(0x0a);
    return this;
  }

  bold(on: boolean): this {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  align(where: 'left' | 'center' | 'right'): this {
    this.bytes.push(ESC, 0x61, where === 'left' ? 0 : where === 'center' ? 1 : 2);
    return this;
  }

  /** "Jollof rice x2 ........ GHS 90.00" on one 32-character line. */
  row(left: string, right: string): this {
    const space = Math.max(1, LINE_WIDTH - left.length - right.length);
    return this.text(`${left.slice(0, LINE_WIDTH - right.length - 1)}${' '.repeat(space)}${right}`);
  }

  divider(): this {
    return this.text('-'.repeat(LINE_WIDTH));
  }

  /** Feed paper past the tear bar, then cut on printers that have a cutter. */
  finish(): this {
    this.bytes.push(ESC, 0x64, 4, GS, 0x56, 0x42, 0x00);
    return this;
  }

  toBase64(): string {
    return toBase64(this.bytes);
  }
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const chunk = (a << 16) | (b << 8) | c;
    out += BASE64[(chunk >> 18) & 63]! + BASE64[(chunk >> 12) & 63]!;
    out += i + 1 < bytes.length ? BASE64[(chunk >> 6) & 63]! : '=';
    out += i + 2 < bytes.length ? BASE64[chunk & 63]! : '=';
  }
  return out;
}
