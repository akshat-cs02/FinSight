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
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3 animate-spring-in">
        <div>
          <h1 className="text-[28px] font-bold font-display text-white">Financial News</h1>
          <p className="eyebrow mt-0.5">Latest market news and analysis</p>
        </div>
        <div className="flex gap-2 card p-1 rounded-xl">
          {(['ALL', 'POSITIVE', 'NEGATIVE', 'NEUTRAL'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      filter === f
                        ? f === 'POSITIVE' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                        : f === 'NEGATIVE' ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                        : f === 'NEUTRAL' ? 'bg-gray-500/15 text-gray-400 border border-gray-500/20'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                      : 'text-ink-muted hover:text-ink-white hover:bg-white/5'
                    }`}>{f}</button>
          ))}
        </div>
      </div>

      {err && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300">{err}</div>}
      {articles === null && !err && <div className="text-ink-dim">Loading news…</div>}
      {list && list.length === 0 && <div className="text-ink-dim text-center py-8">No news matches filter</div>}

      {list && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
               className={`card-accent amber card-surface2 p-5 rounded-xl hover:border-amber-500/40 transition flex flex-col cursor-pointer anim-up delay-${((i % 6) + 1) * 100}`}>
              {a.thumbnail && <img src={a.thumbnail} alt="" className="w-full h-32 object-cover rounded-lg mb-3" />}
              <div className="flex justify-between items-start mb-2 gap-2">
                <h3 className="text-ink-white font-bold flex-1 font-display">{a.title}</h3>
                <span className={`flex-shrink-0 ${
                  a.sentiment === 'POSITIVE' ? 'badge-gains' :
                  a.sentiment === 'NEGATIVE' ? 'badge-losses' :
                  'badge-neutral'
                }`}>{a.sentiment}</span>
              </div>
              {a.summary && <p className="text-ink-muted text-sm line-clamp-3 mb-2">{a.summary}</p>}
              <div className="flex justify-between text-xs text-ink-dim mt-auto">
                <span>{a.source}</span>
                {a.symbol && <span className="text-amber-400 font-medium">{a.symbol}</span>}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
