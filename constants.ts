export const MOVE_SPEED = 0.11;
export const WORLD_SIZE = 12; // 12x12 Grid

export const CANVAS_WIDTH = window.innerWidth; 
export const CANVAS_HEIGHT = window.innerHeight; 

// 3D Colors - Exquisite & Festive
export const COLORS = {
  // Crystal Ball / Night Theme
  background: '#0F172A', // Dark Night Blue (Slate 900) to make the glass shine
  glass_reflection: '#E0F7FA',
  
  snow: '#FFFFFF',
  snow_shadow: '#E3F2FD', // Slightly cooler shadow
  base_side: '#87CEEB', 
  
  // Globe Base
  base_wood: '#3E2723', // Dark Mahogany
  base_gold: '#FFD700', // Gold Trim

  // Environment
  tree_dark: '#1B4D3E', // Deep Pine
  tree_light: '#2E8B57',
  wood: '#5D4037',
  roof: '#B71C1C', // Darker Red
  window_light: '#FFFACD', 
  chimney: '#3E2723',
  
  // Decor
  candy_red: '#D32F2F',
  candy_white: '#EEEEEE',
  ornament_red: '#FF4081',
  ornament_gold: '#FFD700',
  ornament_blue: '#40C4FF',
  
  // Characters
  player: '#FF5252', 
  player_skin: '#FFCCBC',
  gold: '#FFD700',
  
  // ANIMAL DETAILS
  eye_black: '#111111',
  eye_yellow: '#FFEB3B',
  eye_blue: '#2196F3',
  nose_pink: '#FFAB91',
  nose_black: '#212121',
  
  // Fur Colors
  fur_blue_grey: '#78909C',
  fur_white: '#FAFAFA',
  fur_ragdoll_point: '#5D4037',
  fur_black: '#212121',
  fur_teddy: '#D7CCC8', 
  fur_teddy_dark: '#8D6E63',

  // UI
  joystick_bg: 'rgba(255, 255, 255, 0.1)',
  joystick_handle: 'rgba(255, 255, 255, 0.9)',
  
  // Light Marker
  marker_glow: '#FFD700',
  marker_ring: '#FFA000'
};

// Animal Definitions
export const ANIMAL_CONFIGS = {
  CAT_BLUE: { 
    type: 'CAT_BLUE',
    name: 'Winnie',
    scale: 1.1
  },
  CAT_RAGDOLL: { 
    type: 'CAT_RAGDOLL',
    name: 'Lola',
    scale: 1.0
  },
  CAT_BLACK: { 
    type: 'CAT_BLACK',
    name: 'Wanwan',
    scale: 1.05
  },
  DOG_TEDDY: { 
    type: 'DOG_TEDDY',
    name: 'Puppy',
    scale: 1.15
  }
};