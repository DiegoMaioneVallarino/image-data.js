export async function loadImage(file: File): Promise<HTMLImageElement> {
  if (!file.type.startsWith('image/')) throw new Error('Selecciona un archivo de imagen.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally { URL.revokeObjectURL(url); }
}
export function pixelsOf(image: HTMLImageElement, maxSide = 512) {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D no disponible');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
