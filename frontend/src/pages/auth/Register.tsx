import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Mail, Lock, User, UserPlus, Shield } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

export default function RegisterPage() {
  const navigate = useNavigate()
  const register = useAuthStore((s) => s.register)
  const login = useAuthStore((s) => s.login)
  const loading = useAuthStore((s) => s.loading)
  const [form, setForm] = useState({ username: '', email: '', password: '', admin_key: '' })
  const [err, setErr] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    try {
      await register({
        username: form.username,
        email: form.email,
        password: form.password,
        admin_key: form.admin_key || undefined,
      })
      toast.success('Account created — signing you in…')
      await login(form.email, form.password)
      navigate('/dashboard')
    } catch (e: any) {
      setErr(e.response?.data?.detail || e.message)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gold to-gold-2 flex items-center justify-center font-bold text-black shadow-lg shadow-gold/20">FS</div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Create Account</h1>
          </div>
        </div>

        <form onSubmit={onSubmit} className="card-accent card p-6 space-y-4">
          <div>
            <label className="block text-xs text-[var(--dim)] mb-1">Username</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
              <input
                required value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="inp w-full pl-9"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--dim)] mb-1">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
              <input
                type="email" required value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="inp w-full pl-9"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--dim)] mb-1">Password (min 8 chars)</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
              <input
                type="password" required minLength={8} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="inp w-full pl-9"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--dim)] mb-1">Admin key (optional)</label>
            <div className="relative">
              <Shield size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
              <input
                value={form.admin_key}
                onChange={(e) => setForm({ ...form, admin_key: e.target.value })}
                placeholder="leave blank for regular user"
                className="inp w-full pl-9"
              />
            </div>
          </div>

          {err && <div className="bg-red-500/10 border border-red-500/30 rounded p-2 text-red-300 text-xs">{err}</div>}

          <button disabled={loading} type="submit"
                  className="w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-50 py-2.5 rounded-lg font-semibold">
            <UserPlus size={16} /> {loading ? 'Creating…' : 'Create Account'}
          </button>

          <p className="text-center text-sm text-[var(--dim)]">
            Already have an account? <Link to="/login" className="text-gold hover:text-gold-2">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
