import api from './api'

export interface User {
  id: number
  username: string
  email: string
  first_name: string | null
  last_name: string | null
  is_admin: boolean
  subscription_tier: string
  created_at: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export const authService = {
  register: (data: {
    username: string; email: string; password: string;
    first_name?: string; last_name?: string; admin_key?: string;
  }) => api.post<User>('/auth/register', data).then((r) => r.data),

  login: (email: string, password: string) =>
    api.post<TokenResponse>('/auth/login', { email, password }).then((r) => r.data),

  me: () => api.get<User>('/auth/me').then((r) => r.data),

  refresh: (token: string) =>
    api.post<TokenResponse>('/auth/refresh', null, { params: { token } }).then((r) => r.data),

  logout: () => api.post('/auth/logout').then((r) => r.data),
}
