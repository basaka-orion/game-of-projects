import { createFoodAdId } from './state'
import type {
  FoodAdGeneratedImage,
  FoodAdGenerationInput,
  FoodAdGenerationResult,
  FoodAdStyle,
  GeminiImagePart,
} from './types'

type GeminiProxyResult = {
  images?: string[]
  warnings?: string[]
  error?: string
}

function hasElectronGeminiProxy(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).electronAPI?.generateGeminiImages)
}

function stripDataUrlPrefix(dataUrl: string): { data: string; mimeType: string } {
  const match = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/)
  if (!match) return { data: dataUrl, mimeType: 'image/jpeg' }
  const mimeType = match[1] || 'image/jpeg'
  const payload = match[2] ? match[3] : btoa(decodeURIComponent(match[3]))
  return { data: payload, mimeType }
}

export function buildFoodAdPrompt(productName: string, productType: string, style: FoodAdStyle): string {
  return `Task: Create a single, 4K photorealistic product advertisement for food or beverage. No text.

Product Name/Type: "${productName || productType || 'food or beverage product'}"
Vibe/Setting: "${style.scene}"

CRITICAL INSTRUCTIONS:
1. PRESERVE THE PRODUCT: The generated image must feature the product based on the input image. If it is bread or pastry, show texture, flakiness, glaze, crumbs, and appetizing warmth. If it is a drink, show liquid properties, condensation, foam, steam, and glass reflections.
2. COMPOSITION: The product is the absolute hero, large central focus, with professional advertising framing.
3. LIGHTING & ATMOSPHERE: Adapt the lighting to enhance appetizing qualities of the product.
4. REALISM: Use professional product photography standards, perfect depth of field, realistic shadows, reflections, and 4K detail.
5. NO TEXT: Do not add any text overlays, watermarks, labels, or typography.`
}

export async function fileToGeminiPart(file: File): Promise<{ imagePart: GeminiImagePart; previewUrl: string }> {
  const dataUrl = await readFileAsDataUrl(file)
  return {
    imagePart: await dataUrlToGeminiPart(dataUrl),
    previewUrl: dataUrl,
  }
}

export async function dataUrlToGeminiPart(dataUrl: string): Promise<GeminiImagePart> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const maxDimension = 1024
      let width = img.width || maxDimension
      let height = img.height || maxDimension

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width)
          width = maxDimension
        } else {
          width = Math.round((width * maxDimension) / height)
          height = maxDimension
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas context unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      const compressed = canvas.toDataURL('image/jpeg', 0.82)
      const { data, mimeType } = stripDataUrlPrefix(compressed)
      resolve({ inlineData: { data, mimeType } })
    }
    img.onerror = () => {
      const { data, mimeType } = stripDataUrlPrefix(dataUrl)
      resolve({ inlineData: { data, mimeType } })
    }
    img.src = dataUrl
  })
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('FileReader result is not text'))
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export async function generateFoodAdImages(input: FoodAdGenerationInput): Promise<FoodAdGenerationResult> {
  const prompt = buildFoodAdPrompt(input.productName, input.productType, input.style)
  const warnings: string[] = []

  if (hasElectronGeminiProxy()) {
    try {
      const electronAPI = (window as any).electronAPI
      const result = (await electronAPI.generateGeminiImages({
        imagePart: input.imagePart,
        prompt,
        count: input.count,
      })) as GeminiProxyResult

      if (Array.isArray(result.images) && result.images.length > 0) {
        return {
          images: result.images.slice(0, input.count).map((dataUrl) => createGeneratedImage(dataUrl, input.style, input.productName, prompt, 'gemini')),
          prompt,
          usedProvider: 'gemini',
          warnings: result.warnings || [],
        }
      }
      if (result.error) warnings.push(result.error)
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err))
    }
  } else {
    warnings.push('当前为浏览器预览环境：已使用本地广告预览引擎；Electron 内会通过主进程调用 Gemini 图片生成。')
  }

  const localImages = createLocalFoodAds(input.originalImageUrl, input.productName, input.style, prompt, input.count)
  return {
    images: localImages,
    prompt,
    usedProvider: 'local',
    warnings,
  }
}

function createGeneratedImage(
  dataUrl: string,
  style: FoodAdStyle,
  productName: string,
  prompt: string,
  source: FoodAdGeneratedImage['source'],
): FoodAdGeneratedImage {
  return {
    id: createFoodAdId('ad'),
    styleId: style.id,
    productName,
    dataUrl,
    prompt,
    source,
    createdAt: Date.now(),
  }
}

function createLocalFoodAds(
  sourceImageUrl: string,
  productName: string,
  style: FoodAdStyle,
  prompt: string,
  count: number,
): FoodAdGeneratedImage[] {
  return Array.from({ length: count }, (_, index) =>
    createGeneratedImage(renderLocalAdSvg(sourceImageUrl, productName, style, index), style, productName, prompt, 'local'),
  )
}

function renderLocalAdSvg(sourceImageUrl: string, productName: string, style: FoodAdStyle, index: number): string {
  const [bg, accent, light] = style.palette
  const variant = index % 4
  const rotation = [-5, 4, -2, 6][variant]
  const scale = [1.02, 0.92, 1.08, 0.98][variant]
  const shape = variant === 1 ? 'circle' : variant === 2 ? 'diamond' : variant === 3 ? 'arch' : 'plate'
  const href = escapeAttribute(sourceImageUrl)
  const grain = variant % 2 === 0 ? 0.12 : 0.2

  const productMask =
    shape === 'circle'
      ? '<clipPath id="productClip"><circle cx="540" cy="520" r="250"/></clipPath>'
      : shape === 'diamond'
        ? '<clipPath id="productClip"><path d="M540 255 815 520 540 785 265 520Z"/></clipPath>'
        : shape === 'arch'
          ? '<clipPath id="productClip"><path d="M290 785V435c0-150 102-245 250-245s250 95 250 245v350Z"/></clipPath>'
          : '<clipPath id="productClip"><rect x="250" y="255" width="580" height="520" rx="90"/></clipPath>'

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="${bg}"/>
      <stop offset=".52" stop-color="${accent}"/>
      <stop offset="1" stop-color="${light}"/>
    </linearGradient>
    <radialGradient id="halo" cx="${variant === 2 ? '.72' : '.32'}" cy=".22" r=".8">
      <stop stop-color="${light}" stop-opacity=".82"/>
      <stop offset=".44" stop-color="${accent}" stop-opacity=".22"/>
      <stop offset="1" stop-color="${bg}" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="36" stdDeviation="34" flood-color="#000" flood-opacity=".42"/>
    </filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter>
    <pattern id="grain" width="9" height="9" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#fff" opacity="${grain}"/>
    </pattern>
    ${productMask}
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <rect width="1080" height="1080" fill="url(#grain)" opacity=".24"/>
  <circle cx="820" cy="190" r="280" fill="url(#halo)" filter="url(#soft)"/>
  <circle cx="165" cy="910" r="310" fill="${bg}" opacity=".44" filter="url(#soft)"/>
  <path d="M${80 + variant * 28} ${160 + variant * 16}C270 76 350 210 522 144c168-64 322-36 472 96" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width="3"/>
  <ellipse cx="540" cy="835" rx="330" ry="58" fill="#000" opacity=".24"/>
  <g filter="url(#shadow)" transform="translate(0 ${variant === 1 ? 12 : 0}) rotate(${rotation} 540 520) scale(${scale}) translate(${(1 - scale) * 540} ${(1 - scale) * 520})">
    <rect x="230" y="235" width="620" height="560" rx="${shape === 'circle' ? 310 : shape === 'diamond' ? 32 : 96}" fill="#fff" opacity=".2"/>
    <image href="${href}" x="230" y="235" width="620" height="560" preserveAspectRatio="xMidYMid slice" clip-path="url(#productClip)"/>
    <rect x="230" y="235" width="620" height="560" rx="${shape === 'circle' ? 310 : shape === 'diamond' ? 32 : 96}" fill="none" stroke="#fff" stroke-width="3" stroke-opacity=".68"/>
  </g>
  <g opacity=".8">
    <circle cx="${variant === 0 ? 216 : 866}" cy="290" r="10" fill="#fff"/>
    <circle cx="${variant === 2 ? 190 : 900}" cy="690" r="7" fill="#fff"/>
    <path d="M180 825c64-36 128-36 192 0M716 224c62-35 124-35 186 0" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".36"/>
  </g>
  <metadata>${escapeText(productName)} · ${escapeText(style.name)} · local preview</metadata>
</svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeAttribute(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function escapeText(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
