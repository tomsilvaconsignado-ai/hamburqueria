import { supabase, isSupabaseConfigured } from '../lib/supabase/client';

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function uploadImageFile(
  file: File,
  bucket: 'products' | 'couriers' | 'avatars' = 'products'
): Promise<UploadResult> {
  // 1. Validação de formato
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      success: false,
      error: `Formato inválido (${file.type}). Use imagens JPEG, PNG ou WebP.`,
    };
  }

  // 2. Validação de tamanho
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      success: false,
      error: `A imagem excede o tamanho máximo de 5MB (tamanho atual: ${sizeMb}MB).`,
    };
  }

  // 3. Se o Supabase estiver configurado com credenciais válidas, tenta upload no bucket
  if (isSupabaseConfigured && supabase) {
    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const cleanFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const filePath = `${bucket}/${cleanFileName}`;

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (!error && data) {
        const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(data.path);
        return {
          success: true,
          url: publicData.publicUrl,
        };
      }
      console.warn('Supabase storage upload error, falling back to local data URL:', error?.message);
    } catch (err) {
      console.warn('Storage error:', err);
    }
  }

  // 4. Fallback resiliente: Converte para Base64 Data URL para persistência instantânea no client
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        success: true,
        url: reader.result as string,
      });
    };
    reader.onerror = () => {
      resolve({
        success: false,
        error: 'Erro ao processar imagem localmente.',
      });
    };
    reader.readAsDataURL(file);
  });
}
