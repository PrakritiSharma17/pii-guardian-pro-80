import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function importKeyFromBase64(keyBase64: string): Promise<CryptoKey> {
  const keyData = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0))
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    true,
    ["decrypt"]
  )
}

async function decryptText(encryptedBase64: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted
  )
  
  return new TextDecoder().decode(decrypted)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { encryptedText, keyBase64 } = await req.json()
    
    if (!encryptedText || !keyBase64) {
      return new Response(
        JSON.stringify({ error: 'Encrypted text and key are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    const key = await importKeyFromBase64(keyBase64)
    const decryptedText = await decryptText(encryptedText, key)
    
    return new Response(
      JSON.stringify({ decryptedText }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
    
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: 'Failed to decrypt text. Invalid key or corrupted data.' 
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})