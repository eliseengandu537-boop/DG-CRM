'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import { AppUserRecord, userService } from '@/services/userService';

export default function ManagerSettings() {
  const [users, setUsers] = useState<AppUserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [isCreating, setIsCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const allUsers = await userService.getAllUsers();
      setUsers(allUsers);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const managers = useMemo(
    () => users.filter(user => user.role === 'manager'),
    [users]
  );

  const filteredManagers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return managers;

    return managers.filter(manager => {
      return (
        (manager.name || '').toLowerCase().includes(query) ||
        manager.email.toLowerCase().includes(query)
      );
    });
  }, [managers, searchTerm]);

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = formData.name.trim();
    const email = formData.email.trim().toLowerCase();
    const password = formData.password;

    if (!email || !password) {
      alert('Email and password are required.');
      return;
    }

    if (password.length < 6) {
      alert('Password must be at least 6 characters.');
      return;
    }

    try {
      setIsCreating(true);
      const result = await userService.createManager({ name, email, password });
      setFormData({ name: '', email: '', password: '' });
      await loadUsers();

      if (result.passwordSent) {
        alert(`Manager account created and password email sent to ${email}.`);
      } else {
        const fallbackPassword = result.temporaryPassword || password;
        alert(
          `Manager created, but password email failed: ${
            result.passwordError || 'SMTP unavailable'
          }\n\nTemporary password: ${fallbackPassword}`
        );
      }
    } catch (createError) {
      alert(
        createError instanceof Error ? createError.message : 'Failed to create manager account'
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      <div className="bg-white p-6 rounded-lg border border-stone-200 shadow-sm">
        <h3 className="text-xl font-bold text-stone-900 mb-4">Add Manager</h3>
        <p className="text-sm text-stone-600 mb-4">
          Manager login details are emailed automatically after account creation.
        </p>

        <form onSubmit={handleCreateManager} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Manager name (optional)"
            value={formData.name}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="email"
            placeholder="Manager email"
            value={formData.email}
            onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <input
            type="password"
            placeholder="Temporary password"
            value={formData.password}
            onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={isCreating}
              className={`px-4 py-2 rounded-lg transition-colors font-medium ${
                isCreating
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isCreating ? 'Creating Manager...' : '+ Add Manager'}
            </button>
          </div>
        </form>
      </div>

      <div className="flex items-center gap-2 bg-white px-4 py-3 rounded-lg border border-stone-200">
        <FiSearch className="text-stone-400" size={20} />
        <input
          type="text"
          placeholder="Search managers by name or email..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1 outline-none text-sm"
        />
      </div>

      <div className="bg-white rounded-lg border border-stone-200 overflow-hidden flex-1 min-h-0">
        {isLoading ? (
          <div className="p-4 text-stone-600">Loading managers...</div>
        ) : error ? (
          <div className="p-4 text-red-600">{error}</div>
        ) : filteredManagers.length === 0 ? (
          <div className="p-6 text-center text-stone-500">No managers found.</div>
        ) : (
          <div className="overflow-y-auto max-h-[420px]">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-stone-700">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-stone-700">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-stone-700">Role</th>
                  <th className="px-4 py-3 text-left font-semibold text-stone-700">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredManagers.map(manager => (
                  <tr key={manager.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 text-stone-900 font-medium">
                      {manager.name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-stone-700">{manager.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                        Manager
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {new Date(manager.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
