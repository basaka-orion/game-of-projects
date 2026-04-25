/**
 * OpenBasaka Clipper — Popup Logic
 */

;(function () {
  'use strict'

  let currentMode = 'full'
  let extractedContent = ''
  let metadata = {}

  const $ = (sel) => document.querySelector(sel)

  // ─── 初始化 ───

  document.addEventListener('DOMContentLoaded', async () => {
    setupModeButtons()
    await extractContent()

    $('#btnClip').addEventListener('click', clipToOpenBasaka)
  })

  // ─── 模式切换 ───

  function setupModeButtons() {
    const buttons = document.querySelectorAll('.clipper__mode-btn')
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('clipper__mode-btn--active'))
        btn.classList.add('clipper__mode-btn--active')
        currentMode = btn.dataset.mode
        extractContent()
      })
    })
  }

  // ─── 提取内容 ───

  async function extractContent() {
    $('#btnClip').disabled = true
    $('#preview').textContent = '提取中...'

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab) return

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'extract',
        mode: currentMode,
      })

      if (response && response.success) {
        metadata = response.metadata
        extractedContent = response.content

        // 更新 UI
        $('#pageTitle').textContent = metadata.title || '未命名'
        $('#pageUrl').textContent = metadata.url || ''
        $('#preview').textContent = extractedContent.slice(0, 500) + (extractedContent.length > 500 ? '...' : '')
        $('#btnClip').disabled = false
      } else {
        $('#preview').textContent = '提取失败: ' + (response?.error || '未知错误')
      }
    } catch (err) {
      $('#preview').textContent = '无法连接到页面，请刷新后重试'
    }
  }

  // ─── 剪藏到 OpenBasaka ───

  async function clipToOpenBasaka() {
    if (!extractedContent) return

    const template = $('#templateSelect').value
    const title = encodeURIComponent(metadata.title || '未命名页面')
    const url = encodeURIComponent(metadata.url || '')
    const clipUrl = `openbasaka://clip?title=${title}&url=${url}&clipboard=true&template=${template}`

    setStatus('正在发送到 OpenBasaka...', 'processing')

    try {
      // 1. 写入剪贴板
      await navigator.clipboard.writeText(extractedContent)

      // 2. 打开 URI 协议
      const newTab = await chrome.tabs.create({ url: clipUrl })

      // 3. URI 处理后关闭标签页
      setTimeout(() => {
        if (newTab) chrome.tabs.remove(newTab.id)
        setStatus('✅ 已发送到 OpenBasaka', 'success')
      }, 1500)
    } catch (err) {
      setStatus('❌ 发送失败: ' + err.message, 'error')
    }
  }

  // ─── 状态提示 ───

  function setStatus(text, type) {
    const el = $('#status')
    el.textContent = text
    el.className = 'clipper__status' + (type ? ` clipper__status--${type}` : '')
  }
})()
