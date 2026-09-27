import DocumentPicker from 'react-native-document-picker';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';

export type PickedFile = {
  uri: string;
  name: string;
  type: string;
  size?: number;
};

export function isImage(f: PickedFile): boolean {
  return f.type.startsWith('image/');
}

export function isPdf(f: PickedFile): boolean {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
}

export function isGguf(f: PickedFile): boolean {
  return f.name.toLowerCase().endsWith('.gguf');
}

export async function pickAnyFile(): Promise<PickedFile[]> {
  try {
    const results = await DocumentPicker.pick({
      type: [DocumentPicker.types.allFiles],
      allowMultiSelection: false,
      copyTo: 'cachesDirectory',
    });
    return results.map(r => ({
      uri: r.fileCopyUri ?? r.uri,
      name: r.name ?? 'file',
      type: r.type ?? 'application/octet-stream',
      size: r.size ?? undefined,
    }));
  } catch (e: any) {
    if (DocumentPicker.isCancel(e)) return [];
    throw e;
  }
}

export async function pickGguf(): Promise<PickedFile | null> {
  try {
    const results = await DocumentPicker.pick({
      type: [DocumentPicker.types.allFiles],
      allowMultiSelection: false,
      // copyTo gives us a real file:// path llama.rn can mmap; the raw
      // content:// URI is opaque and native code can't open it directly.
      copyTo: 'cachesDirectory',
    });
    const r = results[0];
    if (!r) return null;
    return {
      uri: r.fileCopyUri ?? r.uri,
      name: r.name ?? 'model.gguf',
      type: r.type ?? 'application/octet-stream',
      size: r.size ?? undefined,
    };
  } catch (e: any) {
    if (DocumentPicker.isCancel(e)) return null;
    throw e;
  }
}

export async function snapCamera(): Promise<PickedFile | null> {
  const result = await launchCamera({
    mediaType: 'photo',
    cameraType: 'back',
    saveToPhotos: false,
    quality: 0.8,
    maxWidth: 1600,
    maxHeight: 1600,
  });
  if (result.didCancel || !result.assets?.length) return null;
  const a = result.assets[0];
  return {
    uri: a.uri ?? '',
    name: a.fileName ?? 'snap.jpg',
    type: a.type ?? 'image/jpeg',
    size: a.fileSize ?? undefined,
  };
}

export async function pickImage(): Promise<PickedFile | null> {
  const result = await launchImageLibrary({
    mediaType: 'photo',
    selectionLimit: 1,
  });
  if (result.didCancel || !result.assets?.length) return null;
  const a = result.assets[0];
  return {
    uri: a.uri ?? '',
    name: a.fileName ?? 'image.jpg',
    type: a.type ?? 'image/jpeg',
    size: a.fileSize ?? undefined,
  };
}
