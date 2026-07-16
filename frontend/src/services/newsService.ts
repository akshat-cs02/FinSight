import api from './api'

export interface NewsArticle {
  title: string
  summary: string
  source: string
  url: string
  published_at?: string
  thumbnail?: string
  symbol?: string
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
  sentiment_score: number
}

export const newsService = {
  getNews: (limit = 20) => api.get<{ articles: NewsArticle[] }>('/news', { params: { limit } }).then((r) => r.data.articles),
  getStockNews: (symbol: string, limit = 10) =>
    api.get<{ symbol: string; articles: NewsArticle[] }>(`/news/stock/${symbol}`, { params: { limit } }).then((r) => r.data.articles),
}
