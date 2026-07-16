import React, { useEffect, useState } from 'react'
import { newsService, NewsArticle } from '@/services/newsService'

export default function NewsPage() {
  const [articles, setArticles] = useState<NewsArticle[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'>('ALL')

  useEffect(() => {
    newsService.getNews(30).then(setArticles).catch((e) => setErr(e.response?.data?.detail || e.message))
  }, [])

  const list = articles?.filter((a) => filter === 'ALL' || a.sentiment === filter) || null

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-900 min-h-screen">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-white">Financial News</h1>
        <div className="flex gap-2">
          {(['ALL', 'POSITIVE', 'NEGATIVE', 'NEUTRAL'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded text-xs font-semibold ${
                      filter === f ? 'bg-blue-600 text-white' :
                      'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}>{f}</button>
          ))}
        </div>
      </div>

      {err && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300">{err}</div>}
      {articles === null && !err && <div className="text-gray-500">Loading news…</div>}
      {list && list.length === 0 && <div className="text-gray-500 text-center py-8">No news matches filter</div>}

      {list && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
               className="bg-gray-800 border border-gray-700 rounded-2xl p-5 hover:border-blue-500/40 transition flex flex-col">
              {a.thumbnail && <img src={a.thumbnail} alt="" className="w-full h-32 object-cover rounded-lg mb-3" />}
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-white font-bold flex-1">{a.title}</h3>
                <span className={`ml-2 px-2 py-1 rounded text-xs font-semibold ${
                  a.sentiment === 'POSITIVE' ? 'bg-emerald-500/20 text-emerald-300' :
                  a.sentiment === 'NEGATIVE' ? 'bg-red-500/20 text-red-300' :
                  'bg-gray-500/20 text-gray-300'
                }`}>{a.sentiment}</span>
              </div>
              {a.summary && <p className="text-gray-400 text-sm line-clamp-3 mb-2">{a.summary}</p>}
              <div className="flex justify-between text-xs text-gray-500 mt-auto">
                <span>{a.source}</span>
                {a.symbol && <span className="text-blue-400">{a.symbol}</span>}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
