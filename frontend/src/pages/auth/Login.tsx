import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Mail, Lock, LogIn } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const loading = useAuthStore((s) => s.loading)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    try {
      const user = await login(email, password)
      toast.success(`Welcome back, ${user.username}`)
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
            <h1 className="text-2xl font-bold text-[var(--text)]">FinSight</h1>
          </div>
          <p className="text-[var(--dim)] text-sm">AI-powered stock market analytics</p>
        </div>

        <form onSubmit={onSubmit} className="card-accent card p-6 space-y-4">
          <h2 className="text-xl font-bold text-[var(--text)]">Sign in</h2>

          <div>
            <label className="block text-xs text-[var(--dim)] mb-1">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="inp w-full pl-9"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--dim)] mb-1">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="inp w-full pl-9"
              />
            </div>
          </div>

          {err && <div className="bg-red-500/10 border border-red-500/30 rounded p-2 text-red-300 text-xs">{err}</div>}

          <button disabled={loading} type="submit"
                  className="w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-50 py-2.5 rounded-lg font-semibold">
            <LogIn size={16} /> {loading ? 'Signing in…' : 'Sign In'}
          </button>

          <p className="text-center text-sm text-[var(--dim)]">
            No account? <Link to="/register" className="text-gold hover:text-gold-2">Register</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
