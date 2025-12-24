export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Player {
  x: number;
  z: number;
  rotation: number;
  isMoving: boolean;
}

export interface Animal {
  id: string;
  type: string;
  x: number;
  z: number;
  isRescued: boolean;
  followDelay: number;
}

export interface GameState {
  isPlaying: boolean;
  isWon: boolean;
  envelopeOpen: boolean;
  letterContent: string | null;
  loadingLetter: boolean;
  score: number;
}

export type InputState = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  vector: { x: number; y: number }; // x, y range from -1 to 1
};