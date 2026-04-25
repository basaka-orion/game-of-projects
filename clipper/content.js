/**
 * OpenBasaka Clipper — Content Script
 * 提取页面内容（全文或选区），转换为 Markdown
 */

;(function () {
  'use strict'

  /**
   * 提取页面元数据
   */
  function extractMetadata() {
    const getMeta = (name) => {
      const el =
        document.querySelector(`meta[property="${name}"]`) ||
        document.querySelector(`meta[name="${name}"]`)
      return el ? el.getAttribute('content') || '' : ''
    }

    return {
      title: document.title || '',
      author: getMeta('author') || getMeta('og:article:author') || '',
      description: getMeta('description') || getMeta('og:description') || '',
      url: location.href,
      publishedTime: getMeta('article:published_time') || getMeta('og:article:published_time') || '',
      siteName: getMeta('og:site_name') || '',
      ogImage: getMeta('og:image') || '',
    }
  }

  /**
   * HTML 转 Markdown（简易版，不依赖 Turndown）
   */
  function htmlToMarkdown(el) {
    if (!el) return ''

    const clone = el.cloneNode(true)

    // 移除 script、style、nav、footer 等无关元素
    const removeTags = ['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript']
    removeTags.forEach((tag) => {
      clone.querySelectorAll(tag).forEach((n) => n.remove())
    })

    let md = ''
    const children = clone.childNodes

    for (const node of children) {
      if (node.nodeType === Node.TEXT_NODE) {
        md += node.textContent
        continue
      }

      if (node.nodeType !== Node.ELEMENT_NODE) continue

      const tag = node.tagName.toLowerCase()

      switch (tag) {
        case 'h1':
          md += `\n# ${node.textContent.trim()}\n\n`
          break
        case 'h2':
          md += `\n## ${node.textContent.trim()}\n\n`
          break
        case 'h3':
          md += `\n### ${node.textContent.trim()}\n\n`
          break
        case 'h4':
          md += `\n#### ${node.textContent.trim()}\n\n`
          break
        case 'h5':
          md += `\n##### ${node.textContent.trim()}\n\n`
          break
        case 'p':
          md += `${processInline(node)}\n\n`
          break
        case 'pre':
          const code = node.querySelector('code')
          const lang = code ? (code.className.match(/language-(\w+)/) || ['', ''])[1] : ''
          md += `\n\`\`\`${lang}\n${(code || node).textContent}\n\`\`\`\n\n`
          break
        case 'blockquote':
          const lines = node.textContent.trim().split('\n')
          md += lines.map((l) => `> ${l}`).join('\n') + '\n\n'
          break
        case 'ul':
          node.querySelectorAll(':scope > li').forEach((li) => {
            md += `- ${li.textContent.trim()}\n`
          })
          md += '\n'
          break
        case 'ol':
          let idx = 1
          node.querySelectorAll(':scope > li').forEach((li) => {
            md += `${idx++}. ${li.textContent.trim()}\n`
          })
          md += '\n'
          break
        case 'table':
          md += tableToMarkdown(node)
          break
        case 'img':
          const alt = node.getAttribute('alt') || ''
          const src = node.getAttribute('src') || ''
          if (src) md += `![${alt}](${src})\n\n`
          break
        case 'a':
          md += `[${node.textContent.trim()}](${node.getAttribute('href') || ''})`
          break
        case 'br':
          md += '\n'
          break
        case 'hr':
          md += '\n---\n\n'
          break
        case 'strong':
        case 'b':
          md += `**${node.textContent}**`
          break
        case 'em':
        case 'i':
          md += `*${node.textContent}*`
          break
        case 'code':
          md += `\`${node.textContent}\``
          break
        case 'div':
        case 'section':
        case 'article':
        case 'main':
        case 'span':
          md += htmlToMarkdown(node)
          break
        default:
          md += node.textContent + '\n'
      }
    }

    return md
  }

  function processInline(node) {
    let text = ''
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const t = child.tagName.toLowerCase()
        if (t === 'strong' || t === 'b') text += `**${child.textContent}**`
        else if (t === 'em' || t === 'i') text += `*${child.textContent}*`
        else if (t === 'code') text += `\`${child.textContent}\``
        else if (t === 'a') text += `[${child.textContent}](${child.getAttribute('href') || ''})`
        else if (t === 'img') text += `![${child.getAttribute('alt') || ''}](${child.getAttribute('src') || ''})`
        else text += child.textContent
      }
    }
    return text.trim()
  }

  function tableToMarkdown(table) {
    const rows = table.querySelectorAll('tr')
    if (rows.length === 0) return ''

    let md = ''
    let isFirst = true

    rows.forEach((row) => {
      const cells = row.querySelectorAll('th, td')
      const line = Array.from(cells)
        .map((c) => c.textContent.trim())
        .join(' | ')
      md += `| ${line} |\n`

      if (isFirst) {
        md += `| ${Array.from(cells)
          .map(() => '---')
          .join(' | ')} |\n`
        isFirst = false
      }
    })

    return md + '\n'
  }

  /**
   * 查找主要内容区域
   */
  function findMainContent() {
    // 按优先级尝试各种选择器
    const selectors = [
      'article',
      '[role="main"]',
      'main',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.content',
      '#content',
      '.markdown-body',
      '.prose',
    ]

    for (const sel of selectors) {
      const el = document.querySelector(sel)
      if (el && el.textContent.trim().length > 200) {
        return el
      }
    }

    // 回退到 body
    return document.body
  }

  /**
   * 提取选区内容
   */
  function extractSelection() {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return null

    const range = selection.getRangeAt(0)
    const div = document.createElement('div')
    div.appendChild(range.cloneContents())
    return htmlToMarkdown(div)
  }

  /**
   * 提取完整页面内容
   */
  function extractFullPage() {
    const main = findMainContent()
    return htmlToMarkdown(main)
  }

  // 监听来自 popup/background 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extract') {
      try {
        const metadata = extractMetadata()
        const mode = request.mode || 'full' // 'full' 或 'selection'

        let content
        if (mode === 'selection') {
          content = extractSelection()
          if (!content) {
            // 没有选区，回退到全文
            content = extractFullPage()
          }
        } else {
          // 先检查有没有选区
          const sel = extractSelection()
          content = sel || extractFullPage()
        }

        sendResponse({
          success: true,
          metadata,
          content,
          hasSelection: !!extractSelection(),
        })
      } catch (err) {
        sendResponse({ success: false, error: err.message })
      }
      return true // 异步响应
    }
  })
})()
