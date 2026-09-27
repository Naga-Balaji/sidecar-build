import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ModelEntry = {
  id: string;
  name: string;
  size: string;
  bytes: number;
  url: string;
  filename: string;
  notes: string;
};

// Curated list. All GGUF, all verified to work with llama.rn.
export const MODEL_CATALOG: ModelEntry[] = [
  {
    id: 'qwen-2.5-1.5b-q4km',
    name: 'Qwen 2.5 1.5B Instruct · Q4_K_M',
    size: '~986 MB',
    bytes: 986_000_000,
    url:
      'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf?download=true',
    filename: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    notes: 'Fastest solid option · ~25-40 tok/s on iQOO',
  },
  {
    id: 'llama-3.2-1b-q4km',
    name: 'Llama 3.2 1B Instruct · Q4_K_M',
    size: '~807 MB',
    bytes: 807_000_000,
    url:
      'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf?download=true',
    filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    notes: 'Smallest sensible Llama · ~30-45 tok/s',
  },
  {
    id: 'llama-3.2-3b-q4km',
    name: 'Llama 3.2 3B Instruct · Q4_K_M',
    size: '~1.9 GB',
    bytes: 1_920_000_000,
    url:
      'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true',
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    notes: 'Best quality that fits phone RAM · ~15-25 tok/s',
  },
];

const MODELS_DIR = `${RNFS.DocumentDirectoryPath}/models`;
const LAST_MODEL_KEY = 'sidecar.last_model_path';

export async function ensureModelsDir(): Promise<string> {
  const exists = await RNFS.exists(MODELS_DIR);
  if (!exists) await RNFS.mkdir(MODELS_DIR);
  return MODELS_DIR;
}

export function modelPath(entry: ModelEntry): string {
  return `${MODELS_DIR}/${entry.filename}`;
}

export async function isDownloaded(entry: ModelEntry): Promise<boolean> {
  const path = modelPath(entry);
  const exists = await RNFS.exists(path);
  if (!exists) return false;
  const stat = await RNFS.stat(path);
  // Guard against half-baked partial downloads. Require at least 90% of the
  // advertised size — HF Content-Length can be a bit off.
  return Number(stat.size) > entry.bytes * 0.9;
}

export async function listDownloaded(): Promise<
  {entry: ModelEntry; sizeBytes: number}[]
> {
  await ensureModelsDir();
  const results: {entry: ModelEntry; sizeBytes: number}[] = [];
  for (const entry of MODEL_CATALOG) {
    if (await isDownloaded(entry)) {
      const stat = await RNFS.stat(modelPath(entry));
      results.push({entry, sizeBytes: Number(stat.size)});
    }
  }
  return results;
}

export type DownloadProgress = {
  bytesWritten: number;
  contentLength: number;
  percent: number;
};

/**
 * Downloads the model to app storage. Resumable via RNFS partial file check;
 * if a partial exists, we delete it and start fresh (RNFS doesn't ship a
 * resumable HTTP client on Android for free). Returns final path on success.
 */
export async function downloadModel(
  entry: ModelEntry,
  onProgress: (p: DownloadProgress) => void,
): Promise<string> {
  await ensureModelsDir();
  const dest = modelPath(entry);
  // If already fully downloaded, skip.
  if (await isDownloaded(entry)) {
    onProgress({bytesWritten: entry.bytes, contentLength: entry.bytes, percent: 1});
    return dest;
  }
  // Clean any partial
  if (await RNFS.exists(dest)) {
    try {
      await RNFS.unlink(dest);
    } catch {}
  }
  const {promise} = RNFS.downloadFile({
    fromUrl: entry.url,
    toFile: dest,
    progressInterval: 500,
    progressDivider: 1,
    begin: () => {},
    progress: r => {
      onProgress({
        bytesWritten: r.bytesWritten,
        contentLength: r.contentLength,
        percent: r.contentLength > 0 ? r.bytesWritten / r.contentLength : 0,
      });
    },
  });
  const result = await promise;
  if (result.statusCode < 200 || result.statusCode >= 300) {
    try {
      await RNFS.unlink(dest);
    } catch {}
    throw new Error(`Download failed with HTTP ${result.statusCode}`);
  }
  onProgress({bytesWritten: result.bytesWritten, contentLength: result.bytesWritten, percent: 1});
  return dest;
}

export async function deleteModel(entry: ModelEntry): Promise<void> {
  const path = modelPath(entry);
  if (await RNFS.exists(path)) await RNFS.unlink(path);
  const last = await getLastLoadedPath();
  if (last === path) await AsyncStorage.removeItem(LAST_MODEL_KEY);
}

export async function setLastLoadedPath(path: string) {
  await AsyncStorage.setItem(LAST_MODEL_KEY, path);
}

export async function getLastLoadedPath(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_MODEL_KEY);
}

export async function existsAt(path: string): Promise<boolean> {
  return RNFS.exists(path);
}
