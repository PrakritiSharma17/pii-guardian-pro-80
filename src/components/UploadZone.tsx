import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Image, Shield, AlertTriangle, Download, Key, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ProcessedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'uploaded' | 'analyzing' | 'encrypting' | 'completed' | 'error';
  sessionId?: string;
  piiCount?: number;
  encryptionKey?: string;
  processedPath?: string;
  errorMessage?: string;
}

export const UploadZone = () => {
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const { toast } = useToast();

  const uploadToStorage = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { error } = await supabase.storage
      .from('documents')
      .upload(filePath, file);

    if (error) throw error;
    return filePath;
  };

  const createSession = async (file: File, uploadPath: string) => {
    const { data, error } = await supabase
      .from('document_sessions')
      .insert({
        original_filename: file.name,
        file_size: file.size,
        mime_type: file.type,
        upload_path: uploadPath
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  };

  const processDocument = async (sessionId: string) => {
    const { data, error } = await supabase.functions.invoke('process-document', {
      body: { sessionId }
    });

    if (error) throw error;
    return data;
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newFiles: ProcessedFile[] = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'uploaded'
    }));
    
    setFiles(prev => [...prev, ...newFiles]);
    
    toast({
      title: "Files uploaded",
      description: `${acceptedFiles.length} file(s) ready for PII analysis`,
    });

    // Process each file
    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      const fileState = newFiles[i];

      try {
        // Upload to storage
        const uploadPath = await uploadToStorage(file);
        
        // Create session
        const session = await createSession(file, uploadPath);
        
        // Update file with session ID
        setFiles(prev => prev.map(f => 
          f.id === fileState.id 
            ? { ...f, sessionId: session.id, status: 'analyzing' }
            : f
        ));

        // Process document
        const result = await processDocument(session.id);
        
        // Update with results
        setFiles(prev => prev.map(f => 
          f.id === fileState.id 
            ? { 
                ...f, 
                status: 'completed',
                piiCount: result.piiCount,
                encryptionKey: result.keyBase64,
                processedPath: session.id
              }
            : f
        ));

        toast({
          title: "Processing complete",
          description: `Found and encrypted ${result.piiCount} PII items in ${file.name}`,
        });

      } catch (error) {
        console.error('Error processing file:', error);
        setFiles(prev => prev.map(f => 
          f.id === fileState.id 
            ? { ...f, status: 'error', errorMessage: error.message }
            : f
        ));

        toast({
          title: "Processing failed",
          description: `Failed to process ${file.name}`,
          variant: "destructive",
        });
      }
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.jpg', '.jpeg', '.png', '.tiff']
    },
    maxFiles: 10
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return <FileText className="w-6 h-6" />;
    if (type.includes('image')) return <Image className="w-6 h-6" />;
    return <FileText className="w-6 h-6" />;
  };

  const getPIIBadge = (count: number) => {
    if (count === 0) return <Badge variant="secondary">No PII</Badge>;
    if (count >= 5) return <Badge variant="destructive">{count} PII Items</Badge>;
    if (count >= 2) return <Badge variant="default">{count} PII Items</Badge>;
    return <Badge variant="outline">{count} PII Item</Badge>;
  };

  const downloadProcessedFile = async (file: ProcessedFile) => {
    if (!file.sessionId) return;

    try {
      const { data, error } = await supabase
        .from('document_sessions')
        .select('processed_path')
        .eq('id', file.sessionId)
        .single();

      if (error || !data.processed_path) {
        toast({
          title: "Download failed",
          description: "Processed file not found",
          variant: "destructive",
        });
        return;
      }

      const { data: fileData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(data.processed_path);

      if (downloadError) {
        toast({
          title: "Download failed",
          description: "Could not download processed file",
          variant: "destructive",
        });
        return;
      }

      // Create download link
      const blob = new Blob([fileData], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `processed_${file.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download started",
        description: "Processed file with encrypted PII",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "An error occurred",
        variant: "destructive",
      });
    }
  };

  const copyEncryptionKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({
      title: "Key copied",
      description: "Encryption key copied to clipboard",
    });
  };

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold text-foreground">Upload Documents for PII Analysis</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Drag and drop your PDF documents, scanned images, or photos. Our AI will automatically detect and analyze any personally identifiable information.
            </p>
          </div>

          {/* Upload Zone */}
          <Card className="p-8">
            <div
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed rounded-lg p-12 text-center transition-all cursor-pointer",
                isDragActive 
                  ? "border-primary bg-primary/5" 
                  : "border-border hover:border-primary/50 hover:bg-muted/50"
              )}
            >
              <input {...getInputProps()} />
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">
                    {isDragActive ? "Drop files here" : "Upload your documents"}
                  </h3>
                  <p className="text-muted-foreground">
                    Supports PDF, JPG, PNG, TIFF files up to 50MB each
                  </p>
                </div>
                <Button variant="outline" className="mt-4">
                  Choose Files
                </Button>
              </div>
            </div>
          </Card>

          {/* File List */}
          {files.length > 0 && (
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Processing Queue</h3>
                  <Button variant="ghost" onClick={() => setFiles([])}>
                    Clear All
                  </Button>
                </div>
                
                <div className="space-y-3">
                  {files.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="text-muted-foreground">
                          {getFileIcon(file.type)}
                        </div>
                        <div>
                          <p className="font-medium">{file.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        {file.status === 'uploaded' && (
                          <Badge variant="secondary">Uploaded</Badge>
                        )}
                        {file.status === 'analyzing' && (
                          <Badge variant="outline" className="animate-pulse">Analyzing PII...</Badge>
                        )}
                        {file.status === 'encrypting' && (
                          <Badge variant="outline" className="animate-pulse">Encrypting...</Badge>
                        )}
                        {file.status === 'completed' && file.piiCount !== undefined && (
                          <div className="flex items-center space-x-2">
                            {getPIIBadge(file.piiCount)}
                            {file.piiCount > 0 && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadProcessedFile(file)}
                                  className="h-6 text-xs"
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  Download
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyEncryptionKey(file.encryptionKey!)}
                                  className="h-6 text-xs"
                                >
                                  <Key className="w-3 h-3 mr-1" />
                                  Copy Key
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                        {file.status === 'error' && (
                          <Badge variant="destructive">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {file.errorMessage || 'Error'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
};