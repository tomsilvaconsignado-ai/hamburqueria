import React from 'react';
import { Shield, ShieldAlert, FileText, Clock, User } from 'lucide-react';
import { AuditLog } from '../../../types';
import { formatDateTimeBR } from '../../../lib/formatters/date';

interface AdminAuditLogsPageProps {
  auditLogs: AuditLog[];
}

export const AdminAuditLogsPage: React.FC<AdminAuditLogsPageProps> = ({ auditLogs }) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl">
        <div>
          <h2 className="text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white flex items-center space-x-2">
            <Shield className="w-6 h-6 text-amber-500" />
            <span>REGISTRO IMUTÁVEL DE AUDITORIA & SEGURANÇA</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Histórico permanente de ações sensíveis: alterações de preços, cancelamentos, configurações e acessos
          </p>
        </div>
      </div>

      <div className="p-6 rounded-3xl bg-[#141620] border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
            Eventos Registrados ({auditLogs.length})
          </span>
          <span className="text-[11px] text-zinc-400">Armazenamento append-only seguro</span>
        </div>

        <div className="divide-y divide-zinc-800/60 max-h-[70vh] overflow-y-auto pr-1">
          {auditLogs.length === 0 ? (
            <p className="text-xs text-zinc-400 py-12 text-center">Nenhum evento registrado ainda.</p>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {log.action}
                    </span>
                    <span className="text-white font-semibold">por {log.actor_name}</span>
                  </div>

                  <p className="text-[11px] text-zinc-400">
                    Entidade: <strong className="text-zinc-300">{log.entity_type}</strong> (ID: {log.entity_id})
                  </p>

                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[10px] text-zinc-400 overflow-x-auto max-w-xl">
                      {JSON.stringify(log.metadata)}
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-1.5 text-zinc-400 text-[11px] shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatDateTimeBR(log.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
