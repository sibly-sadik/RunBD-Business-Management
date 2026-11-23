import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Database,
  Edit3,
  Eye,
  EyeOff,
  Headphones,
  KeyRound,
  Link2,
  Power,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { User, UserRole } from '../types';
import { formatShortDate } from '../utils/leadLogic';
import { defaultTitleForRole } from '../utils/teamLogic';

interface AdminTeamManagementViewProps {
  currentUser: User;
  teamMembers: User[];
  loading: boolean;
  schemaMissing: boolean;
  onRefresh: () => Promise<void>;
  onOpenSheetsSettings: () => void;
  onCreateMember: (input: {
    name: string;
    email: string;
    role: UserRole;
    password: string;
    title?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onUpdateMember: (
    memberId: string,
    patch: {
      name?: string;
      role?: UserRole;
      title?: string;
      isActive?: boolean;
      password?: string;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeleteMember: (memberId: string) => Promise<{ ok: boolean; error?: string }>;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin / Supervisor',
  agent: 'Call Center Agent',
  collector: 'Data Collector',
  poster: 'Content & Link Poster',
};

function RoleBadge({ role }: { role: UserRole }) {
  const styles =
    role === 'admin'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
      : role === 'agent'
      ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
      : role === 'collector'
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
      : 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${styles}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

export function AdminTeamManagementView({
  currentUser,
  teamMembers,
  loading,
  schemaMissing,
  onOpenSheetsSettings,
  onCreateMember,
  onUpdateMember,
  onDeleteMember,
}: AdminTeamManagementViewProps) {
  // Add Team Member form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('agent');
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);

  // Filter state
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Edit modal state
  const [editingMember, setEditingMember] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('agent');
  const [editTitle, setEditTitle] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Reset password modal state
  const [resettingMember, setResettingMember] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetError, setResetError] = useState('');
  const [savingReset, setSavingReset] = useState(false);

  // Delete confirmation modal state
  const [deletingMember, setDeletingMember] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Inline row busy state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingMember(null);
        setResettingMember(null);
        setDeletingMember(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const counts = useMemo(() => {
    const activeAgents = teamMembers.filter(
      (m) => m.role === 'agent' && m.isActive !== false
    ).length;
    const activeCollectors = teamMembers.filter(
      (m) => m.role === 'collector' && m.isActive !== false
    ).length;
    const activePosters = teamMembers.filter(
      (m) => m.role === 'poster' && m.isActive !== false
    ).length;
    const inactiveCount = teamMembers.filter((m) => m.isActive === false).length;
    return {
      total: teamMembers.length,
      activeAgents,
      activeCollectors,
      activePosters,
      inactiveCount,
    };
  }, [teamMembers]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teamMembers.filter((m) => {
      if (roleFilter !== 'ALL' && m.role !== roleFilter) return false;
      const isActive = m.isActive !== false;
      if (statusFilter === 'ACTIVE' && !isActive) return false;
      if (statusFilter === 'INACTIVE' && isActive) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        ROLE_LABELS[m.role].toLowerCase().includes(q)
      );
    });
  }, [teamMembers, search, roleFilter, statusFilter]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setFormError('');

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (trimmedName.length < 2) {
      setFormError('Full Name must be at least 2 characters.');
      return;
    }
    if (!trimmedEmail || trimmedEmail.length < 3 || /\s/.test(trimmedEmail)) {
      setFormError('Username / Email must have at least 3 characters and no spaces (e.g. rakib@runbd).');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters long.');
      return;
    }

    setCreating(true);
    try {
      const res = await onCreateMember({
        name: trimmedName,
        email: trimmedEmail,
        role,
        password,
        title: title.trim() || defaultTitleForRole(role),
      });
      if (!res.ok) {
        setFormError(res.error ?? 'Failed to add team member.');
        return;
      }
      setName('');
      setEmail('');
      setRole('agent');
      setTitle('');
      setPassword('');
      setShowAddPassword(false);
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (member: User) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditRole(member.role);
    setEditTitle(member.title);
    setEditError('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || savingEdit) return;
    setEditError('');
    if (editName.trim().length < 2) {
      setEditError('Full Name must be at least 2 characters.');
      return;
    }
    setSavingEdit(true);
    try {
      const patch: { name?: string; role?: UserRole; title?: string } = {
        name: editName.trim(),
        title: editTitle.trim() || defaultTitleForRole(editRole),
      };
      if (editingMember.role !== 'admin') {
        patch.role = editRole;
      }
      const res = await onUpdateMember(editingMember.id, patch);
      if (!res.ok) {
        setEditError(res.error ?? 'Failed to update team member.');
        return;
      }
      setEditingMember(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const openResetModal = (member: User) => {
    setResettingMember(member);
    setNewPassword('');
    setShowResetPassword(false);
    setResetError('');
  };

  const handleSaveResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingMember || savingReset) return;
    setResetError('');
    if (newPassword.length < 6) {
      setResetError('New password must be at least 6 characters long.');
      return;
    }
    setSavingReset(true);
    try {
      const res = await onUpdateMember(resettingMember.id, { password: newPassword });
      if (!res.ok) {
        setResetError(res.error ?? 'Failed to reset password.');
        return;
      }
      setResettingMember(null);
      setNewPassword('');
    } finally {
      setSavingReset(false);
    }
  };

  const handleToggleActive = async (member: User) => {
    if (togglingId) return;
    setTogglingId(member.id);
    try {
      await onUpdateMember(member.id, { isActive: member.isActive === false });
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingMember || deleting) return;
    setDeleteError('');
    setDeleting(true);
    try {
      const res = await onDeleteMember(deletingMember.id);
      if (!res.ok) {
        setDeleteError(res.error ?? 'Failed to remove team member.');
        return;
      }
      setDeletingMember(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Team Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Add, edit, reset passwords, or deactivate Call Center Agents and Data Collectors persisted in Supabase.
          </p>
        </div>
      </div>

      {/* Schema Missing Guidance */}
      {schemaMissing && (
        <div
          role="alert"
          data-testid="team-schema-warning"
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-semibold text-sm">
                Supabase &quot;team_members&quot; table setup required
              </p>
              <p>
                Copy the updated schema from <strong>Google Sheets Sync → Copy Supabase SQL</strong> and execute it in your Supabase SQL Editor to persist new and edited team members.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenSheetsSettings}
            className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Open Copy Supabase SQL
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Active Agents
            </span>
            <Headphones className="w-4 h-4 text-sky-500" />
          </div>
          <p
            data-testid="team-active-agents-count"
            className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400"
          >
            {counts.activeAgents}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Active Collectors
            </span>
            <Database className="w-4 h-4 text-amber-500" />
          </div>
          <p
            data-testid="team-active-collectors-count"
            className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400"
          >
            {counts.activeCollectors}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Posters &amp; Admin
            </span>
            <Link2 className="w-4 h-4 text-violet-500" />
          </div>
          <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {counts.activePosters + 1}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Deactivated
            </span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <p
            data-testid="team-inactive-count"
            className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400"
          >
            {counts.inactiveCount}
          </p>
        </div>
      </div>

      {/* Add Team Member Form + Full-Width Roster */}
      <div className="space-y-6">
        {/* Add Team Member Card */}
        <section className="glass-panel rounded-2xl p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <UserPlus className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Add Team Member
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Credentials are salted and hashed securely before saving to Supabase.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleCreateSubmit} className="mt-4 space-y-3" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-2">
                <label
                  htmlFor="team-member-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Full Name *
                </label>
                <input
                  id="team-member-name"
                  type="text"
                  placeholder="e.g. Rakib"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div className="lg:col-span-2">
                <label
                  htmlFor="team-member-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Username / Email *
                </label>
                <input
                  id="team-member-email"
                  type="text"
                  placeholder="e.g. rakib@runbd"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div className="lg:col-span-2">
                <label
                  htmlFor="team-member-role"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Role *
                </label>
                <select
                  id="team-member-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="agent">Call Center Agent</option>
                  <option value="collector">Data Collector</option>
                  <option value="poster">Content &amp; Link Poster</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <label
                  htmlFor="team-member-title"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Title (Optional)
                </label>
                <input
                  id="team-member-title"
                  type="text"
                  placeholder={defaultTitleForRole(role)}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div className="lg:col-span-2">
                <label
                  htmlFor="team-member-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Password * (min 6)
                </label>
                <div className="relative">
                  <input
                    id="team-member-password"
                    type={showAddPassword ? 'text' : 'password'}
                    placeholder="Initial password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-3 pr-9 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddPassword((prev) => !prev)}
                    aria-label={showAddPassword ? 'Hide new member password' : 'Show new member password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showAddPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="lg:col-span-2">
                <button
                  type="submit"
                  disabled={creating}
                  data-testid="add-team-member-submit"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{creating ? 'Adding...' : 'Add Team Member'}</span>
                </button>
              </div>
            </div>

            {formError && (
              <div
                role="alert"
                data-testid="add-team-member-error"
                className="rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-3 py-2 text-xs text-rose-700 dark:text-rose-300"
              >
                {formError}
              </div>
            )}
          </form>
        </section>

        {/* Team Members Directory Table */}
        <section className="glass-panel rounded-2xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Search team members"
                placeholder="Search name, username, or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter team members by role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as UserRole | 'ALL')}
                className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="ALL">All Roles</option>
                <option value="agent">Call Center Agents</option>
                <option value="collector">Data Collectors</option>
                <option value="poster">Content Posters</option>
                <option value="admin">Admins</option>
              </select>

              <select
                aria-label="Filter team members by status"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')
                }
                className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Deactivated Only</option>
              </select>

              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {filteredMembers.length} member{filteredMembers.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {loading && teamMembers.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading team roster...
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No team members match your current search or filter.
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-3 px-4 font-semibold">Member</th>
                      <th className="py-3 px-3 font-semibold">Username</th>
                      <th className="py-3 px-3 font-semibold">Role</th>
                      <th className="py-3 px-3 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredMembers.map((member) => {
                      const isActive = member.isActive !== false;
                      const isProtectedAdmin = member.role === 'admin' || member.id === currentUser.id;
                      return (
                        <tr
                          key={member.id}
                          data-testid={`team-member-row-${member.id}`}
                          className={`transition-colors ${
                            isActive
                              ? 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                              : 'bg-slate-50/50 dark:bg-slate-950/40 opacity-75'
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center shrink-0">
                                {member.avatarInitials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                  {member.name}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {member.title}
                                  {member.createdAt ? ` · Added ${formatShortDate(member.createdAt)}` : ''}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {member.email}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <RoleBadge role={member.role} />
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
                                isActive
                                  ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                  : 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isActive ? 'bg-emerald-500' : 'bg-rose-500'
                                }`}
                              />
                              {isActive ? 'Active' : 'Deactivated'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                data-testid={`edit-member-btn-${member.id}`}
                                onClick={() => openEditModal(member)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                data-testid={`reset-pw-btn-${member.id}`}
                                onClick={() => openResetModal(member)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-sky-500/35 bg-sky-500/10 hover:bg-sky-500/20 text-xs font-semibold text-sky-700 dark:text-sky-300 transition-colors cursor-pointer"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                                <span>Reset Password</span>
                              </button>
                              {isProtectedAdmin ? (
                                <span
                                  title="Admin account protection enabled"
                                  className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-400"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                  Protected
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    disabled={togglingId === member.id}
                                    data-testid={`toggle-active-btn-${member.id}`}
                                    onClick={() => void handleToggleActive(member)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                                      isActive
                                        ? 'border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                        : 'border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                    }`}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                    <span>{isActive ? 'Deactivate' : 'Activate'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`remove-member-btn-${member.id}`}
                                    onClick={() => {
                                      setDeleteError('');
                                      setDeletingMember(member);
                                    }}
                                    aria-label={`Remove ${member.name}`}
                                    className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
                {filteredMembers.map((member) => {
                  const isActive = member.isActive !== false;
                  const isProtectedAdmin = member.role === 'admin' || member.id === currentUser.id;
                  return (
                    <div key={member.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {member.name}
                          </p>
                          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {member.email}
                          </p>
                        </div>
                        <RoleBadge role={member.role} />
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">{member.title}</span>
                        <span
                          className={`font-semibold ${
                            isActive
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(member)}
                          className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openResetModal(member)}
                          className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg border border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs font-semibold cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Password</span>
                        </button>
                        {!isProtectedAdmin && (
                          <>
                            <button
                              type="button"
                              disabled={togglingId === member.id}
                              onClick={() => void handleToggleActive(member)}
                              className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-semibold cursor-pointer"
                            >
                              <Power className="w-3.5 h-3.5" />
                              <span>{isActive ? 'Deactivate' : 'Activate'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError('');
                                setDeletingMember(member);
                              }}
                              aria-label={`Remove ${member.name}`}
                              className="py-1.5 px-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold cursor-pointer"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Edit Member Modal */}
      {editingMember && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Edit ${editingMember.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Edit Team Member
              </h3>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                aria-label="Close edit modal"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Username: <strong className="font-mono">{editingMember.email}</strong>
                </p>
              </div>
              <div>
                <label
                  htmlFor="edit-member-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Full Name
                </label>
                <input
                  id="edit-member-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              {editingMember.role !== 'admin' && (
                <div>
                  <label
                    htmlFor="edit-member-role"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Role
                  </label>
                  <select
                    id="edit-member-role"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="agent">Call Center Agent</option>
                    <option value="collector">Data Collector</option>
                    <option value="poster">Content &amp; Link Poster</option>
                  </select>
                </div>
              )}
              <div>
                <label
                  htmlFor="edit-member-title"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Title
                </label>
                <input
                  id="edit-member-title"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              {editError && (
                <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                  {editError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resettingMember && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Reset password for ${resettingMember.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Reset Password — {resettingMember.name}
              </h3>
              <button
                type="button"
                onClick={() => setResettingMember(null)}
                aria-label="Close reset password modal"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveResetPassword} className="p-5 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Assign a new password for <strong className="font-mono">{resettingMember.email}</strong>. It will be salted and hashed securely before storing in Supabase.
              </p>
              <div>
                <label
                  htmlFor="reset-member-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  New Password (min 6 characters)
                </label>
                <div className="relative">
                  <input
                    id="reset-member-password"
                    type={showResetPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full pl-3 pr-10 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword((prev) => !prev)}
                    aria-label={showResetPassword ? 'Hide new password' : 'Show new password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {resetError && (
                <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                  {resetError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResettingMember(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingReset}
                  data-testid="confirm-reset-pw-btn"
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  {savingReset ? 'Updating...' : 'Save New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Member Confirmation Modal */}
      {deletingMember && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Confirm removal of ${deletingMember.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-rose-600 dark:text-rose-400">
                Remove Team Member
              </h3>
              <button
                type="button"
                onClick={() => setDeletingMember(null)}
                aria-label="Close remove modal"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Are you sure you want to permanently remove <strong>{deletingMember.name}</strong> (
                <code className="font-mono">{deletingMember.email}</code>)? Existing historical leads and call logs remain preserved, while their login access is deleted.
              </p>
              {deleteError && (
                <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                  {deleteError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeletingMember(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  data-testid="confirm-remove-member-btn"
                  onClick={() => void handleConfirmDelete()}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  {deleting ? 'Removing...' : 'Remove Member'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
