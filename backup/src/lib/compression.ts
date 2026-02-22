/**
 * Compression utilities using the native CompressionStream / DecompressionStream
 * browser APIs (available in all modern browsers).
 *
 * Falls back gracefully (returns input unchanged) when the APIs are unavailable.
 */

const COMPRESSION_FORMAT = 'gzip';

function isCompressionSupported(): boolean {
  return (
    typeof CompressionStream !== 'undefined' &&
    typeof DecompressionStream !== 'undefined'
  );
}

/**
 * Compress a string using gzip and return a base64-encoded result.
 * Falls back to returning the original string if CompressionStream is unavailable.
 */
export async function compressString(input: string): Promise<string> {
  if (!isCompressionSupported()) {
    return input;
  }

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);

    const cs = new CompressionStream(COMPRESSION_FORMAT);
    const writer = cs.writable.getWriter();
    void writer.write(data);
    void writer.close();

    const chunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine all chunks into a single Uint8Array
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert to base64
    let binary = '';
    for (let i = 0; i < combined.length; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  } catch {
    // If compression fails for any reason, return input unchanged
    return input;
  }
}

/**
 * Decompress a base64-encoded gzip string back to the original string.
 * Falls back to returning the input unchanged if DecompressionStream is unavailable.
 */
export async function decompressString(input: string): Promise<string> {
  if (!isCompressionSupported()) {
    return input;
  }

  try {
    // Decode base64 to binary
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const ds = new DecompressionStream(COMPRESSION_FORMAT);
    const writer = ds.writable.getWriter();
    void writer.write(bytes);
    void writer.close();

    const chunks: Uint8Array[] = [];
    const reader = ds.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const decoder = new TextDecoder();
    return decoder.decode(combined);
  } catch {
    // If decompression fails, return input unchanged
    return input;
  }
}
