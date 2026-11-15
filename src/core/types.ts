export type Orientation = 'portrait' | 'landscape' | 'square';
export interface RGB { r: number; g: number; b: number }
export interface ColorSample { hex: string; rgb: RGB; percent: number }
export interface Region { name: string; average: RGB; brightness: number; edgeDensity: number }
export interface ImageDescriptor {
  version: '0.1.0'; id: string; filename: string;
  metadata: { width: number; height: number; aspectRatio: number; orientation: Orientation; bytes: number; mime: string };
  colors: { average: RGB; dominant: ColorSample[]; histogram: { r: number[]; g: number[]; b: number[] }; saturation: number };
  lighting: { brightness: number; contrast: number };
  geometry: { edgeDensity: number; regions: Region[] };
  analyzedAt: string;
}
