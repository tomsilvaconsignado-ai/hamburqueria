import React, { useRef, useState } from 'react';
import { Camera, Trash2, User } from 'lucide-react';
import { uploadCourierPhoto } from '../../../services/storage';

interface Props {
  value: string;
  onChange: (url: string) => void;
}

/** Foto do entregador: tirar na hora (celular) ou escolher da galeria. O cliente vê esta foto. */
export const CourierPhotoInput: React.FC<Props> = ({ value, onChange }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    const res = await uploadCourierPhoto(file);
    setBusy(false);
    if (!res.success || !res.url) setError(res.error || 'Não foi possível enviar a foto.');
    else onChange(res.url);
  };

  return (
    <div>
      <label className="text-zinc-400 block mb-1">Foto do entregador (o cliente vê ao acompanhar a entrega)</label>
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
          {value ? (
            <img src={value} alt="Foto do entregador" className="w-full h-full object-cover" />
          ) : (
            <User className="w-8 h-8 text-zinc-600" />
          )}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 font-bold cursor-pointer"
            >
              <Camera className="w-4 h-4" /> {busy ? 'Enviando…' : value ? 'Trocar foto' : 'Tirar ou escolher foto'}
            </button>
            {value && !busy && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Remover
              </button>
            )}
          </div>
          <p className="text-[11px] text-zinc-500">Rosto bem visível, de frente. A foto é reduzida automaticamente.</p>
          {error && <p className="text-[11px] text-rose-300">{error}</p>}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" capture="user" onChange={pick} className="hidden" aria-label="Foto do entregador" />
    </div>
  );
};
