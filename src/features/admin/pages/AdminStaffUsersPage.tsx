import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Key,
  Shield,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { UserProfile } from '../../../types';
import { authService } from '../../../services/auth.service';

interface AdminStaffUsersPageProps {
  allUsers: UserProfile[];
  onReloadData: () => void;
}

export const AdminStaffUsersPage: React.FC<AdminStaffUsersPageProps> = ({
  allUsers,
  onReloadData,
}) => {
  // Staff creation form state
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'KITCHEN' | 'DELIVERY'>('KITCHEN');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffFeedback, setStaffFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // First admin provisioner form state
  const [adminEmailToPromote, setAdminEmailToPromote] = useState('');
  const [adminFeedback, setAdminFeedback] = useState<string | null>(null);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffFeedback(null);
    setStaffLoading(true);

    try {
      const res = await authService.createStaffMember({
        full_name: newStaffName,
        email: newStaffEmail,
        phone: newStaffPhone,
        role: newStaffRole,
        password: newStaffPassword,
      });

      if (!res.success) {
        setStaffFeedback({
          type: 'error',
          message: res.error || 'Erro ao cadastrar funcionário.',
        });
      } else {
        setStaffFeedback({
          type: 'success',
          message: `Funcionário ${newStaffName} cadastrado com sucesso com perfil ${newStaffRole}!`,
        });
        setNewStaffName('');
        setNewStaffEmail('');
        setNewStaffPassword('');
        setNewStaffPhone('');
        onReloadData();
      }
    } catch (err: unknown) {
      setStaffFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Falha na operação.',
      });
    } finally {
      setStaffLoading(false);
    }
  };

  const handleToggleUser = async (userId: string, currentActive: boolean) => {
    const res = await authService.toggleUserActive(userId, !currentActive);
    if (!res.success) {
      alert(res.error || 'Falha ao alterar status do usuário.');
    } else {
      onReloadData();
    }
  };

  const handleProvisionFirstAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmailToPromote.trim()) return;
    setAdminFeedback('Processando promoção...');
    const res = await authService.provisionFirstAdmin(adminEmailToPromote.trim());
    setAdminFeedback(res.message);
    onReloadData();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl">
        <div>
          <h2 className="text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white flex items-center space-x-2">
            <Users className="w-6 h-6 text-amber-500" />
            <span>EQUIPE & CONTROLE DE ACESSO (RBAC)</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Gerencie colaboradores internos, crie perfis de cozinha/entrega e controle permissões
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form: Cadastrar Membro da Equipe */}
        <div className="lg:col-span-7 p-6 rounded-3xl bg-[#141620] border border-zinc-800 space-y-4">
          <div className="flex items-center space-x-2">
            <UserPlus className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-bold text-white uppercase tracking-wider">
              Cadastrar Funcionário Operacional
            </h3>
          </div>
          <p className="text-xs text-zinc-400">
            O administrador autorizado pode criar perfis internos para operação da cozinha ou equipe de entrega.
          </p>

          {staffFeedback && (
            <div
              className={`p-3.5 rounded-2xl text-xs flex items-center space-x-2 ${
                staffFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{staffFeedback.message}</span>
            </div>
          )}

          <form onSubmit={handleCreateStaff} className="space-y-3 text-xs">
            <div>
              <label className="text-zinc-400 block mb-1">Nome Completo *</label>
              <input
                type="text"
                required
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                placeholder="Ex: André Silva"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 block mb-1">E-mail Corporativo *</label>
                <input
                  type="email"
                  required
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  placeholder="andre@burgerhub.com.br"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Telefone / WhatsApp *</label>
                <input
                  type="tel"
                  required
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value)}
                  placeholder="(11) 98888-7777"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Senha Inicial * (mín. 8 caracteres)</label>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newStaffPassword}
                onChange={(e) => setNewStaffPassword(e.target.value)}
                placeholder="Entregue ao funcionário e peça para trocar no primeiro acesso"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Perfil Operacional (Role) *</label>
              <select
                value={newStaffRole}
                onChange={(e) => setNewStaffRole(e.target.value as 'KITCHEN' | 'DELIVERY')}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
              >
                <option value="KITCHEN">👨‍🍳 Cozinha (Operador KDS)</option>
                <option value="DELIVERY">🛵 Entregador (Motoboy Oficial)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={staffLoading}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold transition cursor-pointer"
            >
              {staffLoading ? 'Cadastrando...' : 'Cadastrar Membro da Equipe'}
            </button>
          </form>
        </div>

        {/* Card: Provisionamento Seguro do Administrador */}
        <div className="lg:col-span-5 p-6 rounded-3xl bg-[#141620] border border-amber-500/30 space-y-4">
          <div className="flex items-center space-x-2">
            <Key className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white uppercase tracking-wider">
              Provisionar Administrador
            </h3>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Por segurança, o cadastro público cria apenas contas com perfil de <strong>CLIENTE</strong>.
            Para promover uma conta cadastrada ao perfil <strong>ADMIN</strong>, execute a atribuição segura.
            O primeiro administrador é criado pelo SQL Editor do Supabase (ver README).
          </p>

          {adminFeedback && (
            <div className="p-3 rounded-xl bg-zinc-900 border border-amber-500/40 text-amber-300 text-xs">
              {adminFeedback}
            </div>
          )}

          <form onSubmit={handleProvisionFirstAdmin} className="space-y-3 text-xs">
            <div>
              <label className="text-zinc-400 block mb-1">E-mail do Usuário a Promover</label>
              <input
                type="email"
                required
                value={adminEmailToPromote}
                onChange={(e) => setAdminEmailToPromote(e.target.value)}
                placeholder="email.cadastrado@exemplo.com"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black uppercase tracking-wider shadow-lg shadow-red-600/20"
            >
              Promover para ADMIN
            </button>
          </form>
        </div>
      </div>

      {/* Tabela de Usuários e Status */}
      <div className="rounded-3xl bg-[#141620] border border-zinc-800 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Controle de Usuários e Status de Acesso ({allUsers.length})
            </h3>
            <p className="text-xs text-zinc-400">
              Usuários desativados perdem imediatamente o acesso a todas as telas operacionais privadas
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 text-zinc-400 font-bold uppercase tracking-wider border-b border-zinc-800">
              <tr>
                <th className="p-4">Nome / Identificação</th>
                <th className="p-4">E-mail</th>
                <th className="p-4">Telefone</th>
                <th className="p-4">Perfil (Role)</th>
                <th className="p-4">Situação</th>
                <th className="p-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {allUsers.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-900/50 transition">
                  <td className="p-4 font-bold text-white">{u.full_name}</td>
                  <td className="p-4 text-zinc-300">{u.email}</td>
                  <td className="p-4 text-zinc-400">{u.phone}</td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                        u.role === 'ADMIN'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : u.role === 'KITCHEN'
                          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                          : u.role === 'DELIVERY'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        u.is_active
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {u.is_active ? 'ATIVO' : 'DESATIVADO'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleToggleUser(u.id, u.is_active)}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                        u.is_active
                          ? 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30'
                          : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {u.is_active ? 'Desativar Conta' : 'Ativar Conta'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
