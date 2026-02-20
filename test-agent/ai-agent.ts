/**
 * AI-Powered Agent using Ollama for Wikipedia Speedrun
 * Streams screenshots via CDP while navigating
 */

import { chromium, Browser, Page, CDPSession } from 'playwright'

const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434'
const AGENT_NAME = process.env.AGENT_NAME || `AI_Agent_${Date.now()}`
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'agent-alpha' // agent-alpha or agent-beta

interface Link {
  href: string
  text: string
}

class AIWikiAgent {
  private browser: Browser | null = null
  private page: Page | null = null
  private cdp: CDPSession | null = null
  private agentId: string = ''
  private apiKey: string = ''
  private matchId: string = ''
  private targetArticle: string = ''
  private clickCount: number = 0
  private streaming: boolean = false
  private visitedArticles: Set<string> = new Set()
  private lastThought: string = ''

  async run() {
    try {
      console.log(`[${AGENT_NAME}] Using model: ${OLLAMA_MODEL}`)

      // 1. Register
      console.log(`[${AGENT_NAME}] Registering...`)
      await this.register()
      console.log(`[${AGENT_NAME}] Registered as ${this.agentId}`)

      // 2. Join queue and wait to be paired
      console.log(`[${AGENT_NAME}] Joining matchmaking queue...`)
      const match = await this.joinQueueAndWaitForPairing()
      this.matchId = match.match_id
      this.targetArticle = match.target_article
      console.log(`[${AGENT_NAME}] Paired! Match: ${this.matchId}`)
      console.log(`[${AGENT_NAME}] Start: ${match.start_article}`)
      console.log(`[${AGENT_NAME}] Target: ${this.targetArticle}`)

      // 3. Launch browser and go to start article
      console.log(`[${AGENT_NAME}] Launching browser...`)
      await this.launchBrowser()
      await this.page!.goto(match.start_article)
      console.log(`[${AGENT_NAME}] Browser ready at start article`)

      // 4. Signal ready
      console.log(`[${AGENT_NAME}] Signaling ready...`)
      await this.signalReady()

      // 5. Wait for match to start (both agents ready)
      console.log(`[${AGENT_NAME}] Waiting for match to start...`)
      await this.waitForMatchStart()

      // 6. Start streaming screenshots
      console.log(`[${AGENT_NAME}] Starting screen stream...`)
      await this.startStreaming()

      // 7. Navigate with AI
      console.log(`[${AGENT_NAME}] Racing to "${this.targetArticle}"...`)
      await this.navigateWithAI()

    } catch (error) {
      console.error(`[${AGENT_NAME}] Error:`, error)
    } finally {
      await this.cleanup()
    }
  }

  private async register(): Promise<void> {
    const res = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: AGENT_NAME,
        owner_wallet: '0x' + Math.random().toString(16).slice(2, 42),
      }),
    })
    if (!res.ok) throw new Error(`Registration failed: ${await res.text()}`)
    const data = await res.json()
    this.agentId = data.agent_id
    this.apiKey = data.api_key
  }

  private async joinQueueAndWaitForPairing(): Promise<{ match_id: string; start_article: string; target_article: string }> {
    // Join queue
    const res = await fetch(`${API_BASE}/api/matches/queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ agent_id: this.agentId }),
    })
    if (!res.ok) throw new Error(`Join queue failed: ${await res.text()}`)

    const result = await res.json()

    // If immediately paired, return match details
    if (result.status === 'paired') {
      return {
        match_id: result.match_id,
        start_article: result.start_article,
        target_article: result.target_article,
      }
    }

    // Otherwise poll until paired
    console.log(`[${AGENT_NAME}] In queue, waiting for opponent...`)
    while (true) {
      await new Promise(r => setTimeout(r, 1000))

      const checkRes = await fetch(`${API_BASE}/api/matches/queue`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      })

      const checkResult = await checkRes.json()

      if (checkResult.status === 'paired') {
        // Fetch full match details
        const matchRes = await fetch(`${API_BASE}/api/matches/${checkResult.match_id}`, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` },
        })
        const match = await matchRes.json()
        return {
          match_id: match.match_id,
          start_article: match.start_article,
          target_article: match.target_article,
        }
      }
    }
  }

  private async signalReady(): Promise<void> {
    const res = await fetch(`${API_BASE}/api/matches/${this.matchId}/ready`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ agent_id: this.agentId }),
    })
    const data = await res.json()
    console.log(`[${AGENT_NAME}] Ready signal:`, data)
  }

  private async waitForMatchStart(): Promise<void> {
    while (true) {
      const res = await fetch(`${API_BASE}/api/matches/${this.matchId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      })
      const match = await res.json()
      if (match.status === 'active') {
        console.log(`[${AGENT_NAME}] Match started!`)
        return
      }
      await new Promise(r => setTimeout(r, 500))
    }
  }

  private async launchBrowser(): Promise<void> {
    this.browser = await chromium.launch({ headless: false })
    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
    })
    this.page = await context.newPage()
    this.cdp = await this.page.context().newCDPSession(this.page)
  }

  private async startStreaming(): Promise<void> {
    if (!this.cdp) return

    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 60,
      everyNthFrame: 3,
    })

    this.streaming = true

    this.cdp.on('Page.screencastFrame', async (event) => {
      if (!this.streaming) return
      await this.cdp!.send('Page.screencastFrameAck', { sessionId: event.sessionId })
      this.pushFrame(event.data)
    })
  }

  private async pushFrame(base64Data: string): Promise<void> {
    try {
      await fetch(`${API_BASE}/api/matches/${this.matchId}/frames`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          agent_id: this.agentId,
          frame: base64Data,
          current_url: this.page?.url() || '',
          click_count: this.clickCount,
          thought: this.lastThought,
        }),
      })
    } catch {}
  }

  private async navigateWithAI(): Promise<void> {
    const maxClicks = 30

    while (this.clickCount < maxClicks) {
      await this.page!.waitForLoadState('domcontentloaded')

      const currentTitle = await this.getCurrentTitle()
      this.visitedArticles.add(currentTitle.toLowerCase())
      console.log(`[${AGENT_NAME}] On: "${currentTitle}" (${this.clickCount} clicks)`)

      // Check if we reached target
      if (this.isTarget(currentTitle)) {
        console.log(`[${AGENT_NAME}] TARGET REACHED!`)
        await this.claimVictory()
        return
      }

      // Get links and ask AI
      const links = await this.getLinks()
      if (links.length === 0) {
        console.log(`[${AGENT_NAME}] No links, going back...`)
        await this.page!.goBack()
        continue
      }

      const choice = await this.askOllama(currentTitle, links)
      if (choice) {
        await this.clickLink(choice)
        this.clickCount++
      } else {
        // Fallback: random
        const fallback = links[Math.floor(Math.random() * Math.min(5, links.length))]
        console.log(`[${AGENT_NAME}] AI unclear, clicking: ${fallback.text}`)
        await this.clickLink(fallback)
        this.clickCount++
      }

      await new Promise(r => setTimeout(r, 300))
    }
  }

  private async getCurrentTitle(): Promise<string> {
    try {
      return await this.page!.$eval('#firstHeading', el => el.textContent?.trim() || '')
    } catch {
      return ''
    }
  }

  private isTarget(title: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    return normalize(title) === normalize(this.targetArticle)
  }

  private async getLinks(): Promise<Link[]> {
    try {
      await this.page!.waitForSelector('#mw-content-text', { timeout: 5000 })
      return await this.page!.$$eval(
        '#mw-content-text p a[href^="/wiki/"]:not([href*=":"]):not([href*="#"])',
        elements => elements
          .map(el => ({
            href: el.getAttribute('href') || '',
            text: el.textContent?.trim() || '',
          }))
          .filter(l => l.text.length > 2 && l.text.length < 60)
          .filter(l => !/^\[\d+\]$/.test(l.text))
          .filter(l => !l.href.includes('disambiguation'))
          .slice(0, 15)
      )
    } catch {
      return []
    }
  }

  private async askOllama(currentArticle: string, links: Link[]): Promise<Link | null> {
    // Filter visited
    const unvisited = links.filter(l => {
      const name = decodeURIComponent(l.href.replace('/wiki/', '')).replace(/_/g, ' ').toLowerCase()
      return !this.visitedArticles.has(name)
    })

    if (unvisited.length === 0) return links[0]

    const linkList = unvisited.map((l, i) => `${i + 1}. ${l.text}`).join('\n')

    // Ask for reasoning + choice
    const prompt = `Target: "${this.targetArticle}"
Current: "${currentArticle}"

Links:
${linkList}

Think briefly about which link connects best to the target, then say the number.`

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt,
          stream: false,
          options: { temperature: 0.3, num_predict: 50 },
        }),
      })

      if (!res.ok) return null

      const data = await res.json()
      const response = data.response?.trim() || ''

      // Save the full thought for streaming
      this.lastThought = response
      console.log(`[${AGENT_NAME}] AI thinks: ${response}`)

      // Extract the number
      const match = response.match(/\d+/)

      if (match) {
        const idx = parseInt(match[0]) - 1
        if (idx >= 0 && idx < unvisited.length) {
          console.log(`[${AGENT_NAME}] Clicking: ${unvisited[idx].text}`)
          return unvisited[idx]
        }
      }
      return null
    } catch {
      this.lastThought = 'Thinking...'
      return null
    }
  }

  private async clickLink(link: Link): Promise<void> {
    try {
      const el = await this.page!.$(`#mw-content-text a[href="${link.href}"]`)
      if (el) {
        await el.scrollIntoViewIfNeeded()
        await el.click()
        await this.page!.waitForLoadState('domcontentloaded', { timeout: 10000 })
      }
    } catch (e) {
      console.log(`[${AGENT_NAME}] Click failed, recovering...`)
      try { await this.page!.goBack() } catch {}
    }
  }

  private async claimVictory(): Promise<void> {
    const res = await fetch(`${API_BASE}/api/matches/${this.matchId}/claim-victory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ agent_id: this.agentId }),
    })
    console.log(`[${AGENT_NAME}] Victory result:`, await res.json())
  }

  private async cleanup(): Promise<void> {
    this.streaming = false
    if (this.cdp) try { await this.cdp.send('Page.stopScreencast') } catch {}
    if (this.browser) await this.browser.close()
  }
}

new AIWikiAgent().run()
