const encodingOptions = [
  ["auto", "Auto detect"],
  ["utf-8", "UTF-8"],
  ["utf-16le", "UTF-16 LE"],
  ["utf-16be", "UTF-16 BE"],
  ["shift_jis", "Shift JIS"],
  ["gb18030", "GB18030"],
  ["big5", "Big5"],
  ["windows-1252", "Windows-1252"]
];

async function readSubtitleFile(file, encoding) {
  const buffer = await file.arrayBuffer();
  return decodeBuffer(buffer, encoding);
}

function decodeBuffer(buffer, encoding) {
  const bytes = new Uint8Array(buffer);
  let label = encoding || "auto";

  if (label === "auto") {
    label = detectEncoding(bytes);
  }

  try {
    return new TextDecoder(label, {
      fatal: false
    }).decode(bytes).replace(/^\uFEFF/, "");
  } catch (_error) {
    throw new Error(`Could not decode subtitle file as ${label}.`);
  }
}

function detectEncoding(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "utf-16le";
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "utf-16be";
  }

  const sampleLength = Math.min(bytes.length, 512);
  let evenNulls = 0;
  let oddNulls = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] !== 0) {
      continue;
    }

    if (index % 2 === 0) {
      evenNulls += 1;
    } else {
      oddNulls += 1;
    }
  }

  if (oddNulls > sampleLength / 8 && evenNulls < oddNulls / 3) {
    return "utf-16le";
  }

  if (evenNulls > sampleLength / 8 && oddNulls < evenNulls / 3) {
    return "utf-16be";
  }

  try {
    new TextDecoder("utf-8", {
      fatal: true
    }).decode(bytes);
    return "utf-8";
  } catch (_error) {
    // Many older ASS/SSA files are legacy single-byte encodings without a BOM.
    // Use Windows-1252 as the least destructive automatic fallback; users can
    // still choose a specific CJK encoding from the popup when needed.
    return "windows-1252";
  }
}

export {
  encodingOptions,
  readSubtitleFile
};
