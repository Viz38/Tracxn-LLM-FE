import { useState, useRef, useEffect } from 'react'
import './index.css'

function App() {
  // Navigation & Model State
  const [view, setView] = useState('analyzer') // 'analyzer' | 'chat'
  const [availableModels, setAvailableModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  
  // Analyzer State
  const [url, setUrl] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('idle') // idle, processing, success, error
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [timing, setTiming] = useState(null)
  const [optimization, setOptimization] = useState(null)

  // Chat State
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const chatEndRef = useRef(null)

  const BASE_API_URL = 'https://viridescent-uriah-leaky.ngrok-free.dev'

  useEffect(() => {
    fetch(`${BASE_API_URL}/models`)
      .then(res => res.json())
      .then(data => {
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models)
          setSelectedModel(data.models[0])
        }
      })
      .catch(err => console.error("Failed to load models", err))
  }, [])

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const cleanContent = (text) => {
    if (!text) return ''
    let cleaned = text
      // 1. Remove Frontmatter (first --- block)
      .replace(/^---[\s\S]*?---\n?/, '')
      // 2. Remove all images ![]()
      .replace(/!\[.*?\]\(.*?\)/g, '')
      // 3. Remove URLs but keep text [text](url) -> text
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      // 4. Collapse multiple newlines
      .replace(/\n\s*\n/g, '\n\n')
      // 5. Trim overall
      .trim()
    
    return cleaned
  }

  useEffect(() => {
    if (view === 'chat') scrollToBottom()
  }, [chatMessages, view])

  const handleAnalyzeSend = async () => {
    if (!url || !content) {
      setError('Please provide both URL and content.')
      setStatus('error')
      return
    }

    setStatus('processing')
    setError('')
    setResult(null)
    setTiming(null)

    const optimizedContent = cleanContent(content)
    const compression = Math.round((1 - (optimizedContent.length / content.length)) * 100)
    setOptimization(compression)
    console.log(`Optimized content: ${content.length} -> ${optimizedContent.length} chars (${compression}% reduction)`)

    const startTime = new Date()

    try {
      const response = await fetch(`${BASE_API_URL}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, content: optimizedContent }),
      })

      if (!response.ok) {
        throw new Error('Failed to process request')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const chunk = JSON.parse(line)
            if (chunk.error) throw new Error(chunk.error)

            // Support dynamic status messages from the backend
            if (chunk.status) setStatus(chunk.status)

            if (chunk.phase === 1) {
              setResult(prev => ({ ...prev, ...chunk.data }))
              // status will be updated by chunk.status if present, 
              // otherwise we can keep the local default
              if (!chunk.status) setStatus('Phase 1 Complete (Summarization Done)')
            } else if (chunk.phase === 2) {
              setResult(prev => ({ ...prev, ...chunk.data }))
              setStatus('success')
              
              const endTime = new Date()
              const duration = ((endTime - startTime) / 1000).toFixed(2)
              setTiming({
                sentAt: startTime.toLocaleString(),
                receivedAt: endTime.toLocaleString(),
                duration: duration
              })
            }
          } catch (e) {
            console.error("Error parsing stream chunk:", e)
          }
        }
      }
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  const handleChatSend = async () => {
    if (!chatInput.trim()) return

    const userMsg = { 
      text: chatInput, 
      sender: 'user', 
      timestamp: new Date().toLocaleTimeString() 
    }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setStatus('processing')

    try {
      const response = await fetch(`${BASE_API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          model: selectedModel, 
          prompt: chatInput 
        }),
      })

      if (!response.ok) throw new Error('Chat failed')

      const data = await response.json()
      const aiMsg = { 
        text: data.response, 
        sender: 'ai', 
        timestamp: new Date().toLocaleTimeString() 
      }
      setChatMessages(prev => [...prev, aiMsg])
      setStatus('idle')
    } catch (err) {
      const errorMsg = { 
        text: `Error: ${err.message}`, 
        sender: 'ai', 
        timestamp: new Date().toLocaleTimeString() 
      }
      setChatMessages(prev => [...prev, errorMsg])
      setStatus('error')
    }
  }

  const renderStatus = () => {
    if (view === 'chat') return null // Chat uses its own state display
    switch (status) {
      case 'processing':
        return <div className="status-badge status-processing"><span className="loader"></span> Processing...</div>
      case 'success':
        return <div className="status-badge status-success">✓ Success</div>
      case 'error':
        return <div className="status-badge status-error">✕ Error: {error}</div>
      default:
        return <div className="status-badge status-idle">● Ready</div>
    }
  }

  return (
    <div className="card">
      <div className="header-meta">
        <h1>Tracxn LLM 0.1</h1>
        <div className="tabs">
          <div 
            className={`tab ${view === 'analyzer' ? 'active' : ''}`}
            onClick={() => setView('analyzer')}
          >
            Analyzer
          </div>
          <div 
            className={`tab ${view === 'chat' ? 'active' : ''}`}
            onClick={() => setView('chat')}
          >
            Chat
          </div>
        </div>
      </div>

      {view === 'chat' && (
        <div className="model-selector">
          <label>Active Model:</label>
          <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
            {availableModels.length > 0 ? (
              availableModels.map(model => (
                <option key={model} value={model}>{model}</option>
              ))
            ) : (
              <option value="">Loading models...</option>
            )}
          </select>
        </div>
      )}
      
      {status === 'processing' && optimization !== null && (
        <div style={{ fontSize: '0.8rem', color: '#646cff', marginBottom: '1rem' }}>
          ✨ Optimizing content... (Reduced size by {optimization}%)
        </div>
      )}
      
      {view === 'analyzer' ? (
        <>
          {renderStatus()}
          <div className="input-group">
            <label>Domain URL</label>
            <input 
              type="text" 
              placeholder="https://example.com" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            
            <label>Scraped Raw Data</label>
            <textarea 
              placeholder="Paste the scraped markdown or text content here..." 
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            
            <button 
              onClick={handleAnalyzeSend} 
              disabled={status === 'processing'}
            >
              {status === 'processing' ? 'Processing...' : 'Analyze Content'}
            </button>
          </div>

          {timing && (
            <div className="timing-container" style={{ 
              display: 'flex', 
              justifyContent: 'space-around', 
              marginTop: '1.5rem',
              marginBottom: '1rem', 
              fontSize: '0.8rem', 
              color: '#888',
              background: 'rgba(255,255,255,0.03)',
              padding: '1rem',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <div><strong>Sent:</strong> {timing.sentAt}</div>
              <div><strong>Received:</strong> {timing.receivedAt}</div>
              <div><strong>Duration:</strong> <span style={{ color: '#646cff', fontWeight: 'bold' }}>{timing.duration}s</span></div>
            </div>
          )}

          {result && (
            <div className="result-container">
              <table>
                <thead>
                  <tr>
                    <th className="key-cell">Field</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {['Summary', 'SD', 'LD', 'Industry', 'Feed'].map(key => (
                    <tr key={key}>
                      <td className="key-cell">{key}</td>
                      <td>{result[key]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="chat-view">
          <div className="chat-container">
            <div className="chat-messages">
              {chatMessages.length === 0 && (
                <div style={{ color: '#555', textAlign: 'center', marginTop: '2rem' }}>
                  Start a conversation with {selectedModel}...
                </div>
              )}
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`chat-bubble ${msg.sender}`}>
                  {msg.text}
                  <div className="chat-timestamp">{msg.timestamp}</div>
                </div>
              ))}
              {status === 'processing' && view === 'chat' && (
                <div className="chat-bubble ai">
                  <div className="typing-indicator">
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-input-area">
              <input 
                type="text" 
                placeholder="Type your message..." 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                disabled={status === 'processing'}
              />
              <button 
                onClick={handleChatSend} 
                disabled={status === 'processing' || !chatInput.trim()}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
