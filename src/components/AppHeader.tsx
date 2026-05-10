import { Link } from 'react-router-dom';
import { Github, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './ThemeToggle';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-4xl flex h-14 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Wallet className="h-5 w-5 text-primary" />
          <span className="text-base">Xpense</span>
          <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
            split with friends
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" asChild aria-label="GitHub repository">
            <a
              href="https://github.com/dinhanhthi/xpense"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
