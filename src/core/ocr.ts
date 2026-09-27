export interface Ocr {
  recognize(imageUri: string): Promise<string>;
}

class MlKitOcr implements Ocr {
  async recognize(imageUri: string): Promise<string> {
    try {
      const TextRecognition = require('@react-native-ml-kit/text-recognition').default;
      const result = await TextRecognition.recognize(imageUri);
      return result?.text ?? '';
    } catch (e) {
      console.warn('[ocr] ML Kit failed:', e);
      return '';
    }
  }
}

let singleton: Ocr | null = null;
export function getOcr(): Ocr {
  singleton ??= new MlKitOcr();
  return singleton;
}
