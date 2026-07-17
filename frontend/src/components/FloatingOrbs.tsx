export default function FloatingOrbs({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} style={{ zIndex: 0 }}>
      <div
        className="absolute -top-32 -right-32 w-96 h-96 rounded-full animate-float-slower opacity-20"
        style={{
          background: 'radial-gradient(circle, rgba(212,168,83,0.4) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="absolute top-1/3 -left-24 w-72 h-72 rounded-full animate-float-slow opacity-15"
        style={{
          background: 'radial-gradient(circle, rgba(201,149,46,0.3) 0%, transparent 70%)',
          filter: 'blur(50px)',
          animationDelay: '-3s',
        }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full animate-float opacity-10"
        style={{
          background: 'radial-gradient(circle, rgba(184,134,11,0.3) 0%, transparent 70%)',
          filter: 'blur(40px)',
          animationDelay: '-1.5s',
        }}
      />
      <div
        className="absolute top-2/3 left-1/3 w-32 h-32 rounded-full animate-drift opacity-8"
        style={{
          background: 'radial-gradient(circle, rgba(212,168,83,0.25) 0%, transparent 70%)',
          filter: 'blur(30px)',
          animationDelay: '-5s',
        }}
      />
    </div>
  )
}
