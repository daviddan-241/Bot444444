import { Link } from 'wouter';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="text-center">
        <p className="text-6xl font-black" style={{ color: '#0A84FF' }}>404</p>
        <h1 className="mt-4 text-2xl font-black" style={{ color: '#07111F' }}>Page not found</h1>
        <p className="mt-2 text-sm" style={{ color: '#65758B' }}>The page you're looking for doesn't exist.</p>
        <Link href="/" className="mt-6 inline-flex h-12 items-center justify-center rounded-3xl px-6 font-black text-white" style={{ background: '#0A84FF' }}>Go home</Link>
      </div>
    </main>
  );
}
