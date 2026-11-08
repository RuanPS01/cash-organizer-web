/**
 * Leitor mínimo de ZIP, sem dependência: só o que a fatura por email precisa
 * (arquivos guardados ou comprimidos com deflate, com ou sem a criptografia
 * tradicional do ZIP, cuja senha o próprio usuário informa).
 *
 * A descompressão usa o `DecompressionStream('deflate-raw')` do navegador. ZIP
 * com criptografia AES (método 99) não é aberto: a mensagem pede o arquivo
 * descompactado.
 */

export class ZipError extends Error {
  constructor(
    message: string,
    /** `password`: falta a senha ou ela não confere; `format`: o arquivo não dá para ler. */
    readonly kind: 'password' | 'format',
  ) {
    super(message);
  }
}

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32Update(crc: number, byte: number): number {
  return (CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = crc32Update(crc, b);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Decifra a criptografia tradicional do ZIP (PKWARE) com a senha informada. */
function zipCryptoDecrypt(data: Uint8Array, password: string): Uint8Array {
  let k0 = 0x12345678;
  let k1 = 0x23456789;
  let k2 = 0x34567890;
  const update = (byte: number) => {
    k0 = crc32Update(k0, byte);
    k1 = (Math.imul((k1 + (k0 & 0xff)) >>> 0, 134775813) + 1) >>> 0;
    k2 = crc32Update(k2, k1 >>> 24);
  };
  for (const b of new TextEncoder().encode(password)) update(b);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const temp = (k2 | 2) & 0xffff;
    const plain = data[i] ^ ((Math.imul(temp, temp ^ 1) >>> 8) & 0xff);
    out[i] = plain;
    update(plain);
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** O arquivo começa com a assinatura de ZIP ("PK\x03\x04")? */
export function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
}

/** Algum arquivo do ZIP está cifrado? Serve para pedir a senha antes de abrir. */
export function zipNeedsPassword(bytes: Uint8Array): boolean {
  return readDirectory(bytes).some((e) => (e.flags & 1) === 1);
}

interface DirEntry {
  name: string;
  flags: number;
  method: number;
  modTime: number;
  crc: number;
  compressedSize: number;
  localOffset: number;
}

function readDirectory(bytes: Uint8Array): DirEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // O fim do diretório central fica nos últimos 22 bytes, mais o comentário
  // do arquivo (até 64 KB).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('O arquivo ZIP está corrompido ou incompleto.', 'format');
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries: DirEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new ZipError('O arquivo ZIP está corrompido ou incompleto.', 'format');
    }
    const flags = view.getUint16(offset + 8, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLen);
    entries.push({
      name: new TextDecoder(flags & 0x800 ? 'utf-8' : 'latin1').decode(nameBytes),
      flags,
      method: view.getUint16(offset + 10, true),
      modTime: view.getUint16(offset + 12, true),
      crc: view.getUint32(offset + 16, true),
      compressedSize: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Extrai os arquivos do ZIP cujo nome passa no filtro. A senha só é usada
 * quando o arquivo está cifrado; sem ela, ou com a errada, lança `ZipError`
 * do tipo `password`.
 */
export async function readZip(
  bytes: Uint8Array,
  filter: (name: string) => boolean,
  password?: string,
): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: ZipEntry[] = [];
  for (const entry of readDirectory(bytes)) {
    if (entry.name.endsWith('/') || !filter(entry.name)) continue;
    const local = entry.localOffset;
    if (view.getUint32(local, true) !== 0x04034b50) {
      throw new ZipError('O arquivo ZIP está corrompido ou incompleto.', 'format');
    }
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    let data = bytes.subarray(start, start + entry.compressedSize);

    if (entry.flags & 1) {
      if (entry.method === 99) {
        throw new ZipError(
          'Este ZIP usa criptografia AES, que o app não abre. Descompacte o arquivo e anexe o CSV.',
          'format',
        );
      }
      if (!password) throw new ZipError('Este ZIP é protegido por senha.', 'password');
      const plain = zipCryptoDecrypt(data, password);
      // O 12º byte do cabeçalho cifrado confere a senha: com descritor de
      // dados (bit 3) ele repete a hora do arquivo, sem ele o CRC.
      const check = entry.flags & 8 ? (entry.modTime >>> 8) & 0xff : entry.crc >>> 24;
      if (plain[11] !== check) throw new ZipError('A senha do ZIP não confere.', 'password');
      data = plain.subarray(12);
    }

    let content: Uint8Array;
    if (entry.method === 0) content = data;
    else if (entry.method === 8) {
      try {
        content = await inflateRaw(data);
      } catch {
        // Com a senha errada o byte de conferência acerta uma vez em 256, e o
        // que sai é lixo que o deflate recusa.
        if (entry.flags & 1) throw new ZipError('A senha do ZIP não confere.', 'password');
        throw new ZipError('Não foi possível descompactar o arquivo.', 'format');
      }
    } else {
      throw new ZipError('O ZIP usa um tipo de compressão que o app não abre.', 'format');
    }
    if (crc32(content) !== entry.crc) {
      if (entry.flags & 1) throw new ZipError('A senha do ZIP não confere.', 'password');
      throw new ZipError('O arquivo ZIP está corrompido.', 'format');
    }
    out.push({ name: entry.name, bytes: content });
  }
  return out;
}
