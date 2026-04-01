const MAX_DIMENSION = 320;
const TARGET_BYTES = 140 * 1024;
const JPEG_QUALITIES = [0.82, 0.74, 0.66, 0.58, 0.5];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image.'));
    image.src = dataUrl;
  });
}

function dataUrlByteLength(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
}

export async function optimizeAvatarForStorage(file: File): Promise<string> {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);

  const largestDimension = Math.max(image.width, image.height);
  const scale = largestDimension > MAX_DIMENSION ? MAX_DIMENSION / largestDimension : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    return originalDataUrl;
  }

  context.drawImage(image, 0, 0, width, height);

  let bestDataUrl = originalDataUrl;
  for (const quality of JPEG_QUALITIES) {
    const compressed = canvas.toDataURL('image/jpeg', quality);
    if (compressed.length < bestDataUrl.length) {
      bestDataUrl = compressed;
    }
    if (dataUrlByteLength(compressed) <= TARGET_BYTES) {
      return compressed;
    }
  }

  return bestDataUrl;
}
