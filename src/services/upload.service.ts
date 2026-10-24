import { supabase, isSupabaseConfigured } from '../lib/supabase/client';

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Envia imagem de produto para o bucket público `products`. */
export async function uploadImageFile(file: File): Promise<UploadResult> {
  const ext = ALLOWED_MIME_TYPES[file.type];
  if (!ext) {
    return { success: false, error: `Formato inválido (${file.type || 'desconhecido'}). Use JPEG, PNG, WebP ou GIF.` };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return { success: false, error: `A imagem excede o tamanho máximo de 5MB (tamanho atual: ${sizeMb}MB).` };
  }

  if (isSupabaseConfigured && supabase) {
    // Caminho relativo ao bucket; extensão derivada do MIME, não do nome enviado
    const filePath = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage
      .from('products')
      .upload(filePath, file, { cacheControl: '3600', upsert: false, contentType: file.type });

    if (error || !data) {
      return { success: false, error: `Falha ao enviar a imagem: ${error?.message ?? 'erro desconhecido'}` };
    }
    const { data: publicData } = supabase.storage.from('products').getPublicUrl(data.path);
    return { success: true, url: publicData.publicUrl };
  }

  // Modo demonstração: imagem fica embutida (Data URL) no armazenamento local do navegador
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ success: true, url: reader.result as string });
    reader.onerror = () => resolve({ success: false, error: 'Erro ao processar imagem localmente.' });
    reader.readAsDataURL(file);
  });
}
