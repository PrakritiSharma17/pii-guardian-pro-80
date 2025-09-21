import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Key, Lock, Unlock, Copy, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const EncryptionTester = () => {
  const [testText, setTestText] = useState("My email is john.doe@example.com and my SSN is 123-45-6789");
  const [encryptedText, setEncryptedText] = useState("");
  const [decryptedText, setDecryptedText] = useState("");
  const [encryptionKey, setEncryptionKey] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  // Client-side AES-GCM functions for testing
  const generateKey = async (): Promise<CryptoKey> => {
    return await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  };

  const exportKeyToBase64 = async (key: CryptoKey): Promise<string> => {
    const raw = await crypto.subtle.exportKey("raw", key);
    return btoa(String.fromCharCode(...new Uint8Array(raw)));
  };

  const importKeyFromBase64 = async (b64: string): Promise<CryptoKey> => {
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return await crypto.subtle.importKey("raw", raw.buffer, "AES-GCM", true, ["encrypt", "decrypt"]);
  };

  const encryptString = async (key: CryptoKey, plainText: string): Promise<string> => {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit nonce for GCM
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      enc.encode(plainText)
    );
    // return iv + ciphertext as base64
    const combined = new Uint8Array(iv.byteLength + cipher.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipher), iv.byteLength);
    return btoa(String.fromCharCode(...combined));
  };

  const decryptString = async (key: CryptoKey, b64Combined: string): Promise<string> => {
    const combined = Uint8Array.from(atob(b64Combined), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const cipher = combined.slice(12);
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      cipher
    );
    return new TextDecoder().decode(plainBuf);
  };

  const handleEncrypt = async () => {
    setIsProcessing(true);
    try {
      const key = await generateKey();
      const keyB64 = await exportKeyToBase64(key);
      const encrypted = await encryptString(key, testText);
      
      setEncryptionKey(keyB64);
      setEncryptedText(encrypted);
      setDecryptedText("");
      
      toast({
        title: "Encryption successful",
        description: "Text encrypted with AES-256-GCM",
      });
    } catch (error) {
      toast({
        title: "Encryption failed",
        description: "An error occurred during encryption",
        variant: "destructive",
      });
    }
    setIsProcessing(false);
  };

  const handleDecrypt = async () => {
    if (!encryptionKey || !encryptedText) {
      toast({
        title: "Missing data",
        description: "Please encrypt text first or provide key and encrypted text",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const key = await importKeyFromBase64(encryptionKey);
      const decrypted = await decryptString(key, encryptedText);
      setDecryptedText(decrypted);
      
      toast({
        title: "Decryption successful",
        description: "Text decrypted successfully",
      });
    } catch (error) {
      toast({
        title: "Decryption failed",
        description: "Invalid key or corrupted data",
        variant: "destructive",
      });
    }
    setIsProcessing(false);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  return (
    <section className="py-20 bg-muted/50">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold text-foreground">AES-GCM Encryption Tester</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Test the client-side AES-256-GCM encryption and decryption functionality used in our PII protection system.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Encryption Section */}
            <Card className="p-6 space-y-4">
              <div className="flex items-center space-x-2">
                <Lock className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Encrypt Text</h3>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Test Text (with PII):</label>
                  <Textarea
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    placeholder="Enter text to encrypt..."
                    className="mt-1"
                    rows={3}
                  />
                </div>
                
                <Button onClick={handleEncrypt} disabled={isProcessing} className="w-full">
                  <Lock className="w-4 h-4 mr-2" />
                  Generate Key & Encrypt
                </Button>
                
                {encryptionKey && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">AES-256 Key (Base64):</label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(encryptionKey, "Encryption key")}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <Input value={encryptionKey} readOnly className="font-mono text-xs" />
                  </div>
                )}
                
                {encryptedText && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Encrypted Text (Base64):</label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(encryptedText, "Encrypted text")}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <Textarea value={encryptedText} readOnly className="font-mono text-xs" rows={3} />
                  </div>
                )}
              </div>
            </Card>

            {/* Decryption Section */}
            <Card className="p-6 space-y-4">
              <div className="flex items-center space-x-2">
                <Unlock className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Decrypt Text</h3>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">AES-256 Key (Base64):</label>
                  <Input
                    value={encryptionKey}
                    onChange={(e) => setEncryptionKey(e.target.value)}
                    placeholder="Paste decryption key..."
                    className="mt-1 font-mono text-xs"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium">Encrypted Text (Base64):</label>
                  <Textarea
                    value={encryptedText}
                    onChange={(e) => setEncryptedText(e.target.value)}
                    placeholder="Paste encrypted text..."
                    className="mt-1 font-mono text-xs"
                    rows={3}
                  />
                </div>
                
                <Button onClick={handleDecrypt} disabled={isProcessing} className="w-full">
                  <Unlock className="w-4 h-4 mr-2" />
                  Decrypt Text
                </Button>
                
                {decryptedText && (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <label className="text-sm font-medium">Decrypted Text:</label>
                    </div>
                    <Textarea value={decryptedText} readOnly className="bg-green-50 border-green-200" rows={3} />
                    <Badge variant="secondary" className="text-green-700">
                      Decryption successful - integrity verified
                    </Badge>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Security Notes */}
          <Card className="p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Key className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Security Features</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">AES-256-GCM</Badge>
                  <span>Authenticated encryption with 256-bit key</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">96-bit IV</Badge>
                  <span>Unique initialization vector per encryption</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">Integrity Check</Badge>
                  <span>Tampering detection with authentication tag</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">Client-Side</Badge>
                  <span>Zero-knowledge encryption in browser</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
};