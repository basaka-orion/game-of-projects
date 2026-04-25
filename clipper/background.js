/**
 * OpenBasaka Clipper — Background Service Worker
 * 处理右键菜单、快捷键、URI 协议调用
 */

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'clip-page',
    title: '剪藏到 OpenBasaka',
    contexts: ['page', 'selection'],
  })

  chrome.contextMenus.create({
    id: 'clip-selection',
    title: '剪藏选区到 OpenBasaka',
    contexts: ['selection'],
  })
})

// 右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const mode = info.menuItemId === 'clip-selection' ? 'selection' : 'full'
  clipCurrentPage(tab, mode)
})

// 快捷键
chrome.commands.onCommand.addListener((command) => {
  if (command === 'clip-page') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) clipCurrentPage(tabs[0], 'full')
    })
  }
})

/**
 * 剪藏当前页面
 * 流程：content.js 提取 → 写入剪贴板 → 打开 openbasaka:// URI
 */
async function clipCurrentPage(tab, mode) {
  try {
    // 1. 让 content.js 提取内容
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract', mode })

    if (!response || !response.success) {
      console.error('Clipper: content extraction failed', response?.error)
      return
    }

    const { metadata, content } = response
    const title = encodeURIComponent(metadata.title || tab.title || '未命名页面')
    const url = encodeURIComponent(metadata.url || tab.url || '')
    const source = encodeURIComponent(tab.url || '')

    // 2. 将 Markdown 内容写入剪贴板
    await navigator.clipboard.writeText(content)

    // 3. 打开 openbasaka:// URI，告知 App 从剪贴板读取
    const clipperUrl = `openbasaka://clip?title=${title}&url=${url}&source=${source}&clipboard=true&mode=${mode}`

    // 使用 chrome.tabs.create 打开 URI
    chrome.tabs.create({ url: clipperUrl }, (newTab) => {
      // URI 协议处理通常会导致页面导航失败，立即关闭
      if (newTab) {
        setTimeout(() => chrome.tabs.remove(newTab.id), 1000)
      }
    })
  } catch (err) {
    console.error('Clipper: clip failed', err)
  }
}
