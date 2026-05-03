export type FoodAdStyleKey =
  | 'rembrandt-dark'
  | 'neon-dream'
  | 'cosmic-pop'
  | 'summer-splash'
  | 'minimalist-chic'
  | 'manga-crush'
  | 'guochao-ink'
  | 'vaporwave-dream'
  | 'girly-fluff'
  | 'gothic-fantasy'
  | 'cozy-cottagecore'
  | 'retro-arcade'
  | 'dark-academia'
  | 'glitchcore'
  | 'barbiecore'
  | 'gorpcore-camping'
  | 'skater-street'
  | 'lofi-chill'
  | 'y2k-nostalgia'
  | 'pool-party'
  | 'fantasy-rpg'
  | 'quiet-luxury'
  | 'dopamine-dressing'
  | 'wasteland-punk'
  | 'soft-sci-fi'
  | 'japanese-fresh'
  | 'esports-room'
  | 'music-festival'
  | 'gym-fit'
  | 'pet-cafe'
  | 'beach-bonfire'
  | 'tokyo-shinjuku'
  | 'paris-cafe'
  | 'havana-streets'
  | 'santorini-alleys'
  | 'kyoto-gion'
  | 'bioluminescent-eden'
  | 'venice-canals'
  | 'marrakech-souk'
  | 'swiss-alps'
  | 'tulum-ruins'
  | 'iceland-aurora'
  | 'japan-sakura'
  | 'nyc-times-square'
  | 'egypt-pyramids'
  | 'rome-colosseum'
  | 'great-wall-china'
  | 'rio-de-janeiro'
  | 'machu-picchu'
  | 'australian-outback'
  | 'amalfi-coast'
  | 'banff-canada'
  | 'thailand-islands'
  | 'dubai-desert'
  | 'african-safari'

export interface FoodAdStyle {
  id: FoodAdStyleKey
  name: string
  description: string
  scene: string
  palette: [string, string, string]
  tone: 'dark' | 'bright' | 'warm' | 'cool' | 'fantasy' | 'street' | 'luxury'
}

export interface GeminiImagePart {
  inlineData: {
    data: string
    mimeType: string
  }
}

export interface FoodAdGeneratedImage {
  id: string
  styleId: FoodAdStyleKey
  productName: string
  dataUrl: string
  prompt: string
  source: 'gemini' | 'local'
  createdAt: number
  warning?: string
}

export interface FoodAdProject {
  id: string
  productName: string
  productType: string
  originalImageUrl: string | null
  originalFileName?: string
  selectedStyleId: FoodAdStyleKey | null
  generatedImages: FoodAdGeneratedImage[]
  lastPrompt: string
  notes: string[]
  createdAt: number
  updatedAt: number
}

export interface FoodAdCrafterState {
  projects: FoodAdProject[]
  activeProjectId: string | null
}

export interface FoodAdGenerationInput {
  imagePart: GeminiImagePart
  originalImageUrl: string
  productName: string
  productType: string
  style: FoodAdStyle
  count: number
}

export interface FoodAdGenerationResult {
  images: FoodAdGeneratedImage[]
  prompt: string
  usedProvider: 'gemini' | 'local'
  warnings: string[]
}
