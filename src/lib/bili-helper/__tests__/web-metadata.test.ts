import { describe, expect, it } from 'vitest'
import { extractFetchedUrlMetadata } from '../web-metadata'

describe('web metadata extraction', () => {
  it('prefers OpenGraph cover and resolves relative image URLs', () => {
    const metadata = extractFetchedUrlMetadata(
      `
      <html>
        <head>
          <title>Fallback title</title>
          <meta property="og:title" content="OpenGraph Title" />
          <meta name="description" content="Plain description" />
          <meta property="og:image" content="/covers/main.jpg" />
          <meta property="og:site_name" content="Example Lab" />
          <link rel="canonical" href="/article/one" />
          <link rel="icon" href="/favicon.png" />
        </head>
        <body><script>ignore()</script><h1>Hello&nbsp;World</h1></body>
      </html>
      `,
      'https://example.com/posts/demo?utm=1',
    )

    expect(metadata.title).toBe('OpenGraph Title')
    expect(metadata.cover).toBe('https://example.com/covers/main.jpg')
    expect(metadata.canonicalUrl).toBe('https://example.com/article/one')
    expect(metadata.favicon).toBe('https://example.com/favicon.png')
    expect(metadata.siteName).toBe('Example Lab')
    expect(metadata.content).toContain('Hello World')
  })

  it('falls back to favicon when no social image exists', () => {
    const metadata = extractFetchedUrlMetadata(
      `<html><head><title>No cover</title><link rel="apple-touch-icon" href="touch.png"></head><body>Text</body></html>`,
      'https://example.com/docs/page',
    )

    expect(metadata.cover).toBe('https://example.com/docs/touch.png')
    expect(metadata.favicon).toBe('https://example.com/docs/touch.png')
  })
})
