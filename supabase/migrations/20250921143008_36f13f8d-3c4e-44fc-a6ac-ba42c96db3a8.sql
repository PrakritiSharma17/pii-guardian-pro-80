-- Create storage bucket for uploaded files
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Create table for document processing sessions
CREATE TABLE public.document_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_filename TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  upload_path TEXT NOT NULL,
  processed_path TEXT,
  encryption_key_hash TEXT,
  pii_detected JSONB DEFAULT '[]',
  processing_status TEXT NOT NULL DEFAULT 'uploaded' CHECK (processing_status IN ('uploaded', 'analyzing', 'encrypting', 'completed', 'error')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Enable RLS
ALTER TABLE public.document_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for document sessions (public access for demo)
CREATE POLICY "Anyone can create document sessions" 
ON public.document_sessions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can view document sessions" 
ON public.document_sessions 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can update document sessions" 
ON public.document_sessions 
FOR UPDATE 
USING (true);

-- Create storage policies for documents bucket
CREATE POLICY "Anyone can upload documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Anyone can view documents" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'documents');

CREATE POLICY "Anyone can update documents" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'documents');

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_document_sessions_updated_at
BEFORE UPDATE ON public.document_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();