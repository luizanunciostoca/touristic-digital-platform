const VERSION = 10;
const SIZE = VERSION * 4 + 17;
const DATA_CODEWORDS = 274;
const ECC_CODEWORDS_PER_BLOCK = 18;
const BLOCK_DATA_LENGTHS = Object.freeze([68, 68, 69, 69] as const);
const MAX_BYTE_PAYLOAD = 271;
const QUIET_ZONE = 4;

interface QrMatrix {
  readonly size: number;
  readonly modules: readonly (readonly boolean[])[];
}

function appendBits(target: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i -= 1) {
    target.push(((value >>> i) & 1) !== 0 ? 1 : 0);
  }
}

function multiply(x: number, y: number): number {
  let a = x;
  let b = y;
  let result = 0;
  for (let i = 0; i < 8; i += 1) {
    if ((b & 1) !== 0) result ^= a;
    const carry = (a & 0x80) !== 0;
    a = (a << 1) & 0xff;
    if (carry) a ^= 0x1d;
    b >>>= 1;
  }
  return result;
}

function reedSolomonDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = multiply(result[j] ?? 0, root);
      if (j + 1 < degree) {
        result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0);
      }
    }
    root = multiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(
  data: readonly number[],
  divisor: Uint8Array,
): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (const byte of data) {
    const factor = byte ^ (result[0] ?? 0);
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < result.length; i += 1) {
      result[i] = (result[i] ?? 0) ^ multiply(divisor[i] ?? 0, factor);
    }
  }
  return result;
}

function dataCodewords(payload: string): readonly number[] {
  const bytes = [...new TextEncoder().encode(payload)];
  if (bytes.length > MAX_BYTE_PAYLOAD) {
    throw new Error("TICKETING_QR_PAYLOAD_TOO_LARGE");
  }

  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 16);
  for (const byte of bytes) appendBits(bits, byte, 8);
  const capacity = DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const result: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) {
      value = (value << 1) | (bits[i + j] ?? 0);
    }
    result.push(value);
  }
  for (let pad = 0; result.length < DATA_CODEWORDS; pad += 1) {
    result.push(pad % 2 === 0 ? 0xec : 0x11);
  }
  return result;
}

function interleavedCodewords(payload: string): readonly number[] {
  const data = dataCodewords(payload);
  const blocks: number[][] = [];
  const eccBlocks: Uint8Array[] = [];
  const divisor = reedSolomonDivisor(ECC_CODEWORDS_PER_BLOCK);
  let offset = 0;
  for (const length of BLOCK_DATA_LENGTHS) {
    const block = data.slice(offset, offset + length);
    offset += length;
    blocks.push(block);
    eccBlocks.push(reedSolomonRemainder(block, divisor));
  }

  const result: number[] = [];
  for (let index = 0; index < Math.max(...BLOCK_DATA_LENGTHS); index += 1) {
    for (const block of blocks) {
      const value = block[index];
      if (value !== undefined) result.push(value);
    }
  }
  for (let index = 0; index < ECC_CODEWORDS_PER_BLOCK; index += 1) {
    for (const block of eccBlocks) result.push(block[index] ?? 0);
  }
  return result;
}

function createMatrix(): {
  modules: boolean[][];
  functions: boolean[][];
  setFunction(row: number, col: number, dark: boolean): void;
} {
  const modules = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => false),
  );
  const functions = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => false),
  );
  function setFunction(row: number, col: number, dark: boolean): void {
    if (row < 0 || col < 0 || row >= SIZE || col >= SIZE) return;
    modules[row]![col] = dark;
    functions[row]![col] = true;
  }
  return { modules, functions, setFunction };
}

function drawFinder(
  setFunction: (row: number, col: number, dark: boolean) => void,
  centerRow: number,
  centerCol: number,
): void {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(
        centerRow + dy,
        centerCol + dx,
        distance !== 2 && distance !== 4,
      );
    }
  }
}

function drawAlignment(
  setFunction: (row: number, col: number, dark: boolean) => void,
  centerRow: number,
  centerCol: number,
): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunction(
        centerRow + dy,
        centerCol + dx,
        Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
      );
    }
  }
}

function formatBits(mask: number): number {
  const data = (0b01 << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function versionBits(): number {
  let remainder = VERSION;
  for (let i = 0; i < 12; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 11) & 1) * 0x1f25);
  }
  return (VERSION << 12) | remainder;
}

function drawFormat(
  setFunction: (row: number, col: number, dark: boolean) => void,
  mask: number,
): void {
  const bits = formatBits(mask);
  const bit = (index: number) => ((bits >>> index) & 1) !== 0;
  for (let i = 0; i <= 5; i += 1) setFunction(i, 8, bit(i));
  setFunction(7, 8, bit(6));
  setFunction(8, 8, bit(7));
  setFunction(8, 7, bit(8));
  for (let i = 9; i < 15; i += 1) setFunction(8, 14 - i, bit(i));
  for (let i = 0; i < 8; i += 1) setFunction(8, SIZE - 1 - i, bit(i));
  for (let i = 8; i < 15; i += 1) setFunction(SIZE - 15 + i, 8, bit(i));
  setFunction(SIZE - 8, 8, true);
}

function drawVersion(
  setFunction: (row: number, col: number, dark: boolean) => void,
): void {
  const bits = versionBits();
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) !== 0;
    const a = SIZE - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunction(b, a, dark);
    setFunction(a, b, dark);
  }
}

function matrixFor(payload: string): QrMatrix {
  const codewords = interleavedCodewords(payload);
  const matrix = createMatrix();
  const { modules, functions } = matrix;
  const setFunction = (row: number, col: number, dark: boolean): void =>
    matrix.setFunction(row, col, dark);

  drawFinder(setFunction, 3, 3);
  drawFinder(setFunction, 3, SIZE - 4);
  drawFinder(setFunction, SIZE - 4, 3);
  for (let i = 8; i < SIZE - 8; i += 1) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }
  const centers = [6, 28, 50];
  for (const row of centers) {
    for (const col of centers) {
      if (
        (row === 6 && col === 6) ||
        (row === 6 && col === 50) ||
        (row === 50 && col === 6)
      ) {
        continue;
      }
      drawAlignment(setFunction, row, col);
    }
  }
  drawFormat(setFunction, 0);
  drawVersion(setFunction);

  const bits: number[] = [];
  for (const byte of codewords) appendBits(bits, byte, 8);
  let bitIndex = 0;
  let upward = true;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < SIZE; vertical += 1) {
      const row = upward ? SIZE - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const col = right - offset;
        if (functions[row]![col]) continue;
        const raw = (bits[bitIndex] ?? 0) !== 0;
        const masked = (row + col) % 2 === 0 ? !raw : raw;
        modules[row]![col] = masked;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
  if (bitIndex !== codewords.length * 8) {
    throw new Error("TICKETING_QR_MATRIX_CAPACITY_MISMATCH");
  }
  drawFormat(setFunction, 0);
  drawVersion(setFunction);
  return Object.freeze({
    size: SIZE,
    modules: Object.freeze(modules.map((row) => Object.freeze([...row]))),
  });
}

export function renderTicketQrSvg(payload: unknown): string | null {
  if (typeof payload !== "string" || !/^tck\.v1\./u.test(payload)) return null;
  const matrix = matrixFor(payload);
  const dimension = matrix.size + QUIET_ZONE * 2;
  const path: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.modules[row]?.[col]) {
        path.push(`M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" role="img" aria-label="QR code do ingresso" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path.join("")}" fill="black"/></svg>`;
}
