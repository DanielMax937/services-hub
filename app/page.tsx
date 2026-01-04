import { ServiceList } from '@/components/service-list';
import { Server, Github } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500">
                <Server className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-100">Services Hub</h1>
                <p className="text-xs text-zinc-500">Local Dev Ops Dashboard</p>
              </div>
            </div>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <Github className="h-5 w-5 text-zinc-400" />
            </a>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <ServiceList />
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 mt-auto">
        <div className="container mx-auto px-4 py-4 text-center text-sm text-zinc-500">
          Manage local Python and Node.js development services
        </div>
      </footer>
    </div>
  );
}
