import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PIIMatch {
  type: string
  value: string
  start: number
  end: number
  confidence: number
}

// PII detection patterns
const PII_PATTERNS = {
  email: {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    confidence: 0.95
  },
  ssn: {
    regex: /\b\d{3}-?\d{2}-?\d{4}\b/g,
    confidence: 0.9
  },
  phone: {
    regex: /(\+?1?[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    confidence: 0.85
  },
  creditCard: {
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    confidence: 0.9
  },
  zipCode: {
    regex: /\b\d{5}(?:-\d{4})?\b/g,
    confidence: 0.7
  }
}

function detectPII(text: string): PIIMatch[] {
  const matches: PIIMatch[] = []
  
  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
    let match
    
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        type,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: pattern.confidence
      })
    }
  }
  
  return matches.sort((a, b) => a.start - b.start)
}

async function generateAESKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  )
}

async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("raw", key)
  return btoa(String.fromCharCode(...new Uint8Array(exported)))
}

async function encryptText(text: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(text)
  )
  
  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(encrypted), iv.length)
  
  return btoa(String.fromCharCode(...combined))
}

async function processDocument(sessionId: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  try {
    // Get session data
    const { data: session, error: sessionError } = await supabase
      .from('document_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    
    if (sessionError || !session) {
      throw new Error('Session not found')
    }
    
    // Update status to analyzing
    await supabase
      .from('document_sessions')
      .update({ processing_status: 'analyzing' })
      .eq('id', sessionId)
    
    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(session.upload_path)
    
    if (downloadError || !fileData) {
      throw new Error('Failed to download file')
    }
    
    // Convert file to text (for demo, we'll assume it's a text file or PDF)
    const text = await fileData.text()
    
    // Detect PII
    const piiMatches = detectPII(text)
    
    if (piiMatches.length === 0) {
      // No PII found, mark as completed
      await supabase
        .from('document_sessions')
        .update({ 
          processing_status: 'completed',
          pii_detected: []
        })
        .eq('id', sessionId)
      return
    }
    
    // Update status to encrypting
    await supabase
      .from('document_sessions')
      .update({ processing_status: 'encrypting' })
      .eq('id', sessionId)
    
    // Generate encryption key
    const encryptionKey = await generateAESKey()
    const keyBase64 = await exportKeyToBase64(encryptionKey)
    
    // Encrypt PII and replace in text
    let processedText = text
    const encryptedPII = []
    
    // Process matches in reverse order to maintain indices
    for (let i = piiMatches.length - 1; i >= 0; i--) {
      const match = piiMatches[i]
      const encrypted = await encryptText(match.value, encryptionKey)
      const placeholder = `[ENCRYPTED_PII_${i}:${encrypted}]`
      
      processedText = processedText.slice(0, match.start) + 
                    placeholder + 
                    processedText.slice(match.end)
      
      encryptedPII.unshift({
        ...match,
        encrypted: encrypted
      })
    }
    
    // Upload processed file
    const processedPath = `processed/${sessionId}.txt`
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(processedPath, new Blob([processedText], { type: 'text/plain' }))
    
    if (uploadError) {
      throw new Error('Failed to upload processed file')
    }
    
    // Hash the key for storage (never store the actual key)
    const keyHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyBase64))
    const keyHashBase64 = btoa(String.fromCharCode(...new Uint8Array(keyHash)))
    
    // Update session with results
    await supabase
      .from('document_sessions')
      .update({
        processing_status: 'completed',
        processed_path: processedPath,
        encryption_key_hash: keyHashBase64,
        pii_detected: encryptedPII
      })
      .eq('id', sessionId)
    
    return { success: true, keyBase64, piiCount: piiMatches.length }
    
  } catch (error) {
    // Update session with error
    await supabase
      .from('document_sessions')
      .update({
        processing_status: 'error',
        error_message: error.message
      })
      .eq('id', sessionId)
    
    throw error
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { sessionId } = await req.json()
    
    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'Session ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    const result = await processDocument(sessionId)
    
    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
    
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An error occurred processing the document' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})