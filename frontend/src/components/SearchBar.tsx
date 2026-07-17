import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import gsap from 'gsap'
import { stockService, SearchResult } from '@/services/stockService'

type Market = 'all' | 'us' | 'india' | 'crypto' | 'forex' | 'europe' | 'commodities'

const MARKET_LABELS: { id: Market; label: string; flag: string }[] = [
  { id: 'all',         label: 'All',         flag: '🌐' },
  { id: 'us',          label: 'US',          flag: '🇺🇸' },
  { id: 'india',       label: 'India',       flag: '🇮🇳' },
  { id: 'crypto',      label: 'Crypto',      flag: '₿'  },
  { id: 'forex',       label: 'Forex',       flag: '💱' },
  { id: 'europe',      label: 'Europe',      flag: '🇪🇺' },
  { id: 'commodities', label: 'Commodities', flag: '🏗️' },
]

const MARKET_SUGGESTIONS: Record<Market, { symbol: string; name: string; type?: string }[]> = {
  all: [],
  us: [
    { symbol: 'AAPL',  name: 'Apple Inc.',         type: 'EQUITY' },
    { symbol: 'MSFT',  name: 'Microsoft',           type: 'EQUITY' },
    { symbol: 'GOOGL', name: 'Alphabet',            type: 'EQUITY' },
    { symbol: 'AMZN',  name: 'Amazon',              type: 'EQUITY' },
    { symbol: 'NVDA',  name: 'NVIDIA',              type: 'EQUITY' },
    { symbol: 'TSLA',  name: 'Tesla',               type: 'EQUITY' },
    { symbol: 'META',  name: 'Meta Platforms',      type: 'EQUITY' },
    { symbol: 'JPM',   name: 'JPMorgan Chase',      type: 'EQUITY' },
  ],
  india: [
    { symbol: 'RELIANCE.NS',    name: 'Reliance Industries', type: 'EQUITY' },
    { symbol: 'TCS.NS',         name: 'Tata Consultancy',    type: 'EQUITY' },
    { symbol: 'HDFCBANK.NS',    name: 'HDFC Bank',           type: 'EQUITY' },
    { symbol: 'ICICIBANK.NS',   name: 'ICICI Bank',          type: 'EQUITY' },
    { symbol: 'INFY.NS',        name: 'Infosys',             type: 'EQUITY' },
    { symbol: 'BHARTIARTL.NS',  name: 'Bharti Airtel',       type: 'EQUITY' },
    { symbol: 'ITC.NS',         name: 'ITC',                 type: 'EQUITY' },
    { symbol: 'SBIN.NS',        name: 'State Bank of India', type: 'EQUITY' },
    { symbol: 'LT.NS',          name: 'Larsen & Toubro',     type: 'EQUITY' },
    { symbol: 'KOTAKBANK.NS',   name: 'Kotak Mahindra Bank', type: 'EQUITY' },
    { symbol: 'HINDUNILVR.NS',  name: 'Hindustan Unilever',  type: 'EQUITY' },
    { symbol: 'AXISBANK.NS',    name: 'Axis Bank',           type: 'EQUITY' },
    { symbol: 'MARUTI.NS',      name: 'Maruti Suzuki',       type: 'EQUITY' },
    { symbol: 'BAJFINANCE.NS',  name: 'Bajaj Finance',       type: 'EQUITY' },
    { symbol: 'ASIANPAINT.NS',  name: 'Asian Paints',        type: 'EQUITY' },
    { symbol: 'TITAN.NS',       name: 'Titan Company',       type: 'EQUITY' },
    { symbol: 'SUNPHARMA.NS',   name: 'Sun Pharma',          type: 'EQUITY' },
    { symbol: 'NESTLEIND.NS',   name: 'Nestlé India',        type: 'EQUITY' },
    { symbol: 'TATAMOTORS.NS',  name: 'Tata Motors',         type: 'EQUITY' },
    { symbol: 'TATASTEEL.NS',   name: 'Tata Steel',          type: 'EQUITY' },
    { symbol: 'WIPRO.NS',       name: 'Wipro',               type: 'EQUITY' },
    { symbol: 'HCLTECH.NS',     name: 'HCL Technologies',    type: 'EQUITY' },
    { symbol: 'TECHM.NS',       name: 'Tech Mahindra',       type: 'EQUITY' },
    { symbol: 'ULTRACEMCO.NS',  name: 'UltraTech Cement',    type: 'EQUITY' },
    { symbol: 'ADANIENT.NS',    name: 'Adani Enterprises',   type: 'EQUITY' },
    { symbol: 'ADANIPORTS.NS',  name: 'Adani Ports',         type: 'EQUITY' },
    { symbol: 'ADANIGREEN.NS',  name: 'Adani Green Energy',  type: 'EQUITY' },
    { symbol: 'POWERGRID.NS',   name: 'Power Grid Corp',     type: 'EQUITY' },
    { symbol: 'NTPC.NS',        name: 'NTPC',                type: 'EQUITY' },
    { symbol: 'ONGC.NS',        name: 'ONGC',                type: 'EQUITY' },
    { symbol: 'COALINDIA.NS',   name: 'Coal India',          type: 'EQUITY' },
    { symbol: 'JSWSTEEL.NS',    name: 'JSW Steel',           type: 'EQUITY' },
    { symbol: 'HINDALCO.NS',    name: 'Hindalco',            type: 'EQUITY' },
    { symbol: 'GRASIM.NS',      name: 'Grasim Industries',   type: 'EQUITY' },
    { symbol: 'BAJAJFINSV.NS',  name: 'Bajaj Finserv',       type: 'EQUITY' },
    { symbol: 'INDUSINDBK.NS',  name: 'IndusInd Bank',       type: 'EQUITY' },
    { symbol: 'DRREDDY.NS',     name: "Dr Reddy's Labs",     type: 'EQUITY' },
    { symbol: 'CIPLA.NS',       name: 'Cipla',               type: 'EQUITY' },
    { symbol: 'DIVISLAB.NS',    name: "Divi's Labs",         type: 'EQUITY' },
    { symbol: 'BRITANNIA.NS',   name: 'Britannia',           type: 'EQUITY' },
    { symbol: 'TATACONSUM.NS',  name: 'Tata Consumer',       type: 'EQUITY' },
    { symbol: 'EICHERMOT.NS',   name: 'Eicher Motors',       type: 'EQUITY' },
    { symbol: 'HEROMOTOCO.NS',  name: 'Hero MotoCorp',       type: 'EQUITY' },
    { symbol: 'BAJAJ-AUTO.NS',  name: 'Bajaj Auto',          type: 'EQUITY' },
    { symbol: 'M&M.NS',         name: 'Mahindra & Mahindra', type: 'EQUITY' },
    { symbol: 'ZOMATO.NS',      name: 'Zomato',              type: 'EQUITY' },
    { symbol: 'PAYTM.NS',       name: 'Paytm',               type: 'EQUITY' },
    { symbol: 'NYKAA.NS',       name: 'Nykaa',               type: 'EQUITY' },
    { symbol: 'POLICYBZR.NS',   name: 'PB Fintech (Policybazaar)', type: 'EQUITY' },
    { symbol: 'IRCTC.NS',       name: 'IRCTC',               type: 'EQUITY' },
    { symbol: 'DMART.NS',       name: 'Avenue Supermarts',   type: 'EQUITY' },
    { symbol: 'LICI.NS',        name: 'LIC of India',        type: 'EQUITY' },
    { symbol: 'PIDILITIND.NS',  name: 'Pidilite',            type: 'EQUITY' },
    { symbol: 'GODREJCP.NS',    name: 'Godrej Consumer',     type: 'EQUITY' },
    { symbol: 'DABUR.NS',       name: 'Dabur India',         type: 'EQUITY' },
    { symbol: 'MARICO.NS',      name: 'Marico',              type: 'EQUITY' },
    { symbol: 'HAVELLS.NS',     name: 'Havells India',       type: 'EQUITY' },
    { symbol: 'AMBUJACEM.NS',   name: 'Ambuja Cements',      type: 'EQUITY' },
    { symbol: 'SHREECEM.NS',    name: 'Shree Cement',        type: 'EQUITY' },
    { symbol: 'IOC.NS',         name: 'Indian Oil',          type: 'EQUITY' },
    { symbol: 'BPCL.NS',        name: 'Bharat Petroleum',    type: 'EQUITY' },
    { symbol: 'HDFCLIFE.NS',    name: 'HDFC Life',           type: 'EQUITY' },
    { symbol: 'SBILIFE.NS',     name: 'SBI Life',            type: 'EQUITY' },
    { symbol: 'ICICIPRULI.NS',  name: 'ICICI Prudential',    type: 'EQUITY' },
    { symbol: 'YESBANK.NS',     name: 'Yes Bank',            type: 'EQUITY' },
    { symbol: 'IDFCFIRSTB.NS',  name: 'IDFC First Bank',     type: 'EQUITY' },
    { symbol: 'PNB.NS',         name: 'Punjab National Bank', type: 'EQUITY' },
    { symbol: 'BANKBARODA.NS',  name: 'Bank of Baroda',      type: 'EQUITY' },
    { symbol: 'CANBK.NS',       name: 'Canara Bank',         type: 'EQUITY' },
    { symbol: 'SAIL.NS',        name: 'SAIL',                type: 'EQUITY' },
    { symbol: 'VEDL.NS',        name: 'Vedanta',             type: 'EQUITY' },
    { symbol: 'GAIL.NS',        name: 'GAIL India',          type: 'EQUITY' },
    { symbol: 'BEL.NS',         name: 'Bharat Electronics',  type: 'EQUITY' },
    { symbol: 'HAL.NS',         name: 'Hindustan Aeronautics',type: 'EQUITY' },
    { symbol: 'BHEL.NS',        name: 'BHEL',                type: 'EQUITY' },
    { symbol: 'IRFC.NS',        name: 'Indian Railway Finance',type: 'EQUITY' },
    { symbol: 'RECLTD.NS',      name: 'REC Limited',         type: 'EQUITY' },
    { symbol: 'PFC.NS',         name: 'Power Finance Corp',  type: 'EQUITY' },
    { symbol: 'JIOFIN.NS',      name: 'Jio Financial',       type: 'EQUITY' },
    { symbol: 'MOTILALOFS.NS',  name: 'Motilal Oswal',       type: 'EQUITY' },
    { symbol: 'TRENT.NS',       name: 'Trent',               type: 'EQUITY' },
    { symbol: 'PERSISTENT.NS',  name: 'Persistent Systems',  type: 'EQUITY' },
    { symbol: 'LTIM.NS',        name: 'LTIMindtree',         type: 'EQUITY' },
    { symbol: 'COFORGE.NS',     name: 'Coforge',             type: 'EQUITY' },
    { symbol: 'MPHASIS.NS',     name: 'Mphasis',             type: 'EQUITY' },
    { symbol: 'TATAPOWER.NS',   name: 'Tata Power',          type: 'EQUITY' },
    { symbol: 'TATACHEM.NS',    name: 'Tata Chemicals',      type: 'EQUITY' },
    { symbol: 'TATAELXSI.NS',   name: 'Tata Elxsi',          type: 'EQUITY' },
    { symbol: 'MAZDOCK.NS',     name: 'Mazagon Dock',        type: 'EQUITY' },
    { symbol: 'COCHINSHIP.NS',  name: 'Cochin Shipyard',     type: 'EQUITY' },
    { symbol: 'IDEA.NS',        name: 'Vodafone Idea',       type: 'EQUITY' },
    { symbol: 'SUZLON.NS',      name: 'Suzlon Energy',       type: 'EQUITY' },
    { symbol: 'YESBANK.NS',     name: 'Yes Bank',            type: 'EQUITY' },
    { symbol: '^NSEI',          name: 'NIFTY 50',            type: 'INDEX'  },
    { symbol: '^BSESN',         name: 'SENSEX',              type: 'INDEX'  },
    { symbol: '^NSEBANK',       name: 'BANK NIFTY',          type: 'INDEX'  },
  ],
  crypto: [
    { symbol: 'BTC-USD',  name: 'Bitcoin',     type: 'CRYPTOCURRENCY' },
    { symbol: 'ETH-USD',  name: 'Ethereum',    type: 'CRYPTOCURRENCY' },
    { symbol: 'SOL-USD',  name: 'Solana',      type: 'CRYPTOCURRENCY' },
    { symbol: 'BNB-USD',  name: 'BNB',         type: 'CRYPTOCURRENCY' },
    { symbol: 'XRP-USD',  name: 'XRP',         type: 'CRYPTOCURRENCY' },
    { symbol: 'ADA-USD',  name: 'Cardano',     type: 'CRYPTOCURRENCY' },
    { symbol: 'DOGE-USD', name: 'Dogecoin',    type: 'CRYPTOCURRENCY' },
    { symbol: 'AVAX-USD', name: 'Avalanche',   type: 'CRYPTOCURRENCY' },
  ],
  forex: [
    { symbol: 'EURUSD=X', name: 'EUR / USD', type: 'CURRENCY' },
    { symbol: 'GBPUSD=X', name: 'GBP / USD', type: 'CURRENCY' },
    { symbol: 'USDJPY=X', name: 'USD / JPY', type: 'CURRENCY' },
    { symbol: 'AUDUSD=X', name: 'AUD / USD', type: 'CURRENCY' },
    { symbol: 'USDCAD=X', name: 'USD / CAD', type: 'CURRENCY' },
    { symbol: 'USDCHF=X', name: 'USD / CHF', type: 'CURRENCY' },
    { symbol: 'NZDUSD=X', name: 'NZD / USD', type: 'CURRENCY' },
    { symbol: 'USDINR=X', name: 'USD / INR', type: 'CURRENCY' },
  ],
  europe: [
    { symbol: 'SAP.DE',   name: 'SAP',         type: 'EQUITY' },
    { symbol: 'ASML.AS',  name: 'ASML',        type: 'EQUITY' },
    { symbol: 'SIE.DE',   name: 'Siemens',     type: 'EQUITY' },
    { symbol: 'MC.PA',    name: 'LVMH',        type: 'EQUITY' },
    { symbol: 'AZN.L',    name: 'AstraZeneca', type: 'EQUITY' },
    { symbol: 'SHEL.L',   name: 'Shell',       type: 'EQUITY' },
    { symbol: 'BP.L',     name: 'BP',          type: 'EQUITY' },
    { symbol: 'NESN.SW',  name: 'Nestlé',      type: 'EQUITY' },
  ],
  commodities: [
    { symbol: 'GLD',  name: 'Gold',        type: 'ETF' },
    { symbol: 'SLV',  name: 'Silver',      type: 'ETF' },
    { symbol: 'USO',  name: 'Crude Oil',   type: 'ETF' },
    { symbol: 'UNG',  name: 'Natural Gas', type: 'ETF' },
    { symbol: 'CPER', name: 'Copper',      type: 'ETF' },
    { symbol: 'PPLT', name: 'Platinum',    type: 'ETF' },
    { symbol: 'WEAT', name: 'Wheat',       type: 'ETF' },
    { symbol: 'CORN', name: 'Corn',        type: 'ETF' },
  ],
}

const TYPE_LABEL: Record<string, string> = {
  EQUITY: 'Stock', CRYPTOCURRENCY: 'Crypto', CURRENCY: 'Forex',
  ETF: 'ETF', INDEX: 'Index',
}

export default function SearchBar() {
  const navigate  = useNavigate()
  const [q, setQ] = useState('')
  const [results,  setResults]  = useState<SearchResult[]>([])
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [market,   setMarket]   = useState<Market>('crypto')
  const [expanded, setExpanded] = useState(false)
  const timer  = useRef<number | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const nicheMarkets = MARKET_LABELS.filter((m) => ['crypto','forex','europe','commodities'].includes(m.id))
  const activeMarket = MARKET_LABELS.find((m) => m.id === market)
  const suggestions = MARKET_SUGGESTIONS[market]
  const showSuggestions = !q.trim() && market !== 'all' && suggestions.length > 0

  // Search when query changes
  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      setLoading(true)
      try {
        const r = await stockService.search(q.trim())
        setResults(r)
        setOpen(true)
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 300)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [q])

  // GSAP: expand/collapse animation
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    if (expanded) {
      gsap.to(el, {
        width: 400,
        duration: 0.35,
        ease: 'power3.out',
      })
      gsap.fromTo(
        el.querySelector('.search-content'),
        { opacity: 0, y: -8 },
        { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out', delay: 0.15 }
      )
      setTimeout(() => searchInputRef.current?.focus(), 200)
    } else {
      gsap.to(el, {
        width: '36px',
        minWidth: '36px',
        duration: 0.25,
        ease: 'power2.out',
      })
    }
  }, [expanded])

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
        setExpanded(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const pick = (sym: string, tvSym?: string) => {
    setQ(''); setOpen(false); setResults([])
    const upper = sym.toUpperCase()
    const url = tvSym ? `/stocks/${upper}?tv=${encodeURIComponent(tvSym)}` : `/stocks/${upper}`
    navigate(url)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && q.trim()) pick(q.trim())
    if (e.key === 'Escape') { setExpanded(false); setOpen(false) }
  }

  const toggleExpand = () => {
    if (expanded) {
      setExpanded(false)
      setOpen(false)
    } else {
      setExpanded(true)
    }
  }

  return (
    <div
      ref={boxRef}
      className="relative overflow-visible"
      style={{ width: '36px', minWidth: '36px' }}
    >
      {/* Collapsed: just search icon */}
      {!expanded && (
        <button
          onClick={toggleExpand}
          className="w-9 h-9 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white/70 transition-all duration-300"
          title="Search"
        >
          <Search size={16} />
        </button>
      )}

      {/* Expanded: chips + search input */}
      {expanded && (
        <div className="search-content">
          {/* 4 niche market chips on TOP */}
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            {nicheMarkets.map((m) => (
              <button
                key={m.id}
                onClick={() => { setMarket(m.id); if (!q.trim()) setOpen(true); searchInputRef.current?.focus() }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                  market === m.id
                    ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                    : 'text-white/40 hover:text-white/70 border border-transparent hover:border-white/[0.06]'
                }`}
              >
                {m.flag} {m.label}
              </button>
            ))}
            {/* Close button */}
            <button
              onClick={toggleExpand}
              className="ml-auto w-6 h-6 rounded-md bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center text-white/30 hover:text-white/60 transition-all duration-200"
              title="Close search"
            >
              <X size={12} />
            </button>
          </div>

          {/* Search input BELOW chips */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={15} />
            <input
              ref={searchInputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              onFocus={() => (results.length > 0 || showSuggestions) && setOpen(true)}
              placeholder={
                market === 'crypto'? 'Search crypto (BTC-USD, ETH-USD, SOL-USD…)' :
                market === 'forex' ? 'Any pair — EURUSD, GBPUSD, USDJPY…' :
                market === 'europe'? 'European stocks (SAP.DE, AZN.L, MC.PA…)' :
                                     'Commodities — GLD, SLV, USO, UNG…'
              }
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-green-500/50 focus:bg-white/[0.06] transition-all duration-300"
            />
          </div>

          {/* Dropdown */}
          {open && (
            <div className="absolute z-50 mt-1 w-full card-layer rounded-xl shadow-xl max-h-80 overflow-auto">
              {/* Mobile market chips (desktop chips already visible above input) */}
              <div className="flex sm:hidden gap-1.5 p-2.5 border-b border-white/[0.06] flex-wrap">
                {MARKET_LABELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setMarket(m.id); if (!q.trim()) setOpen(true) }}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium transition-all duration-200 ${
                      market === m.id
                        ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    {m.flag} {m.label}
                  </button>
                ))}
              </div>
              {/* Market suggestions */}
              {showSuggestions && !q.trim() && (
                <>
                  <div className="px-3 py-2 text-xs text-white/30 border-b border-white/[0.06]">
                    Popular in {MARKET_LABELS.find((m) => m.id === market)?.label}
                  </div>
                  {suggestions.map((s) => (
                    <button key={s.symbol} onClick={() => pick(s.symbol)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.03] border-b border-white/[0.04] last:border-b-0 flex items-center justify-between">
                      <span>
                        <span className="font-bold text-white/80">{s.symbol}</span>
                        <span className="text-white/30 ml-2">{s.name}</span>
                      </span>
                      {s.type && (
                        <span className="text-xs text-white/20 bg-white/[0.04] px-2 py-0.5 rounded-full">
                          {TYPE_LABEL[s.type] || s.type}
                        </span>
                      )}
                    </button>
                  ))}
                </>
              )}
              {/* Live search results */}
              {q.trim() && loading && (
                <div className="px-3 py-2 text-white/40 text-sm">Searching…</div>
              )}
              {q.trim() && !loading && results.length === 0 && (
                <button onClick={() => pick(q)} className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.03]">
                  <span className="font-bold text-white/80">{q.toUpperCase()}</span>
                  <span className="text-white/30 ml-2">— go directly to this ticker</span>
                </button>
              )}
              {q.trim() && results.map((r) => (
                <button key={r.symbol} onClick={() => pick(r.symbol, r.tv_symbol)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.03] border-b border-white/[0.04] last:border-b-0 flex items-center justify-between">
                  <span>
                    <span className="font-bold text-white/80">{r.symbol}</span>
                    {r.name && <span className="text-white/30 ml-2">{r.name}</span>}
                  </span>
                  {r.exchange && <span className="text-xs text-white/20">{r.exchange}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
